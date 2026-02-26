import {
  normalizeCommentAvatarKey as normalizeCommentAvatarKeyUtil,
  resolveCommentAvatarAsset as resolveCommentAvatarAssetUtil,
} from "./utils/commentAvatar.js";
import { HEX64_REGEX } from "../../../utils/hex.js";
import { sanitizeProfileMediaUrl } from "../../../utils/profileMedia.js";
import logger from "../../../utils/logger.js";
import { CommentNodeFactory } from "./commentNodeFactory.js";

export class CommentsListRenderer {
  constructor({ controller } = {}) {
    this.controller = controller;
    this.document = controller.document;
    this.window = controller.window;
    this.logger = controller.logger || logger;
    this.helpers = controller.modal?.helpers || {}; // Need helpers for npub format

    this.listRoot = null;
    this.loadMoreButton = null;
    this.countLabel = null;
    this.emptyState = null;

    this.commentProfiles = new Map();
    this.commentNodes = new Map();
    this.commentChildLists = new Map();
    this.commentNodeElements = new Map();
    this.commentNpubEncodingFailures = new Set();
    this.commentAvatarCache = new Map();
    this.commentAvatarFailures = new Set();

    this.commentThreadContext = {
      videoEventId: "",
      parentCommentId: null,
    };

    this.DEFAULT_PROFILE_AVATAR = "assets/svg/default-profile.svg";

    this.boundCommentLoadMoreHandler = this.handleCommentLoadMore.bind(this);

    this.nodeFactory = new CommentNodeFactory({
      document: this.document,
      window: this.window,
      logger: this.logger,
      dispatch: (type, detail) => this.controller.dispatch(type, detail),
      DEFAULT_PROFILE_AVATAR: this.DEFAULT_PROFILE_AVATAR
    });
  }

  initialize({ list, loadMoreButton, countLabel, emptyState }) {
    this.listRoot = list;
    this.loadMoreButton = loadMoreButton;
    this.countLabel = countLabel;
    this.emptyState = emptyState;

    if (this.loadMoreButton) {
      this.loadMoreButton.addEventListener("click", this.boundCommentLoadMoreHandler);
    }
  }

  destroy() {
    if (this.loadMoreButton) {
      this.loadMoreButton.removeEventListener("click", this.boundCommentLoadMoreHandler);
    }
    this.listRoot = null;
    this.loadMoreButton = null;
    this.countLabel = null;
    this.emptyState = null;
    this.commentProfiles.clear();
    this.commentNodes.clear();
    this.commentChildLists.clear();
    this.commentNodeElements.clear();
    this.commentAvatarCache.clear();
    this.commentAvatarFailures.clear();
  }

  handleCommentLoadMore(event) {
    if (event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }
    const triggerElement =
      (event && event.currentTarget) || this.loadMoreButton || null;
    this.controller.dispatch("comment:load-more", {
      parentId: this.commentThreadContext.parentCommentId || null,
      triggerElement,
    });
  }

  render(snapshot) {
    if (!this.listRoot || !this.document) {
      return;
    }

    const commentsMap = this.normalizeCommentMap(snapshot?.commentsById);
    const childrenMap = this.normalizeChildrenMap(snapshot?.childrenByParent);
    this.commentProfiles = this.normalizeProfileMap(snapshot?.profiles);

    this.commentThreadContext.videoEventId =
      typeof snapshot?.videoEventId === "string"
        ? snapshot.videoEventId.trim()
        : "";
    this.commentThreadContext.parentCommentId =
      typeof snapshot?.parentCommentId === "string" &&
      snapshot.parentCommentId.trim()
        ? snapshot.parentCommentId.trim()
        : null;

    this.commentNodes.clear();
    this.commentChildLists = new Map();
    this.commentChildLists.set(null, this.listRoot);

    this.listRoot.textContent = "";

    const fragment = this.document.createDocumentFragment();
    const topLevelIds = this.getChildCommentIds(childrenMap, null);
    topLevelIds.forEach((commentId) => {
      const node = this.buildCommentTree(
        commentId,
        commentsMap,
        childrenMap,
        0
      );
      if (node) {
        fragment.appendChild(node);
      }
    });

    this.listRoot.appendChild(fragment);

    this.updateCommentCount(this.commentNodes.size);
    this.toggleCommentEmptyState(this.commentNodes.size === 0);
  }

  clear() {
    this.commentNodes.clear();
    this.commentChildLists.clear();
    this.commentNodeElements.clear();
    this.commentNpubEncodingFailures.clear();
    if (this.listRoot) {
      this.listRoot.textContent = "";
      this.commentChildLists.set(null, this.listRoot);
    }
    this.updateCommentCount(0);
    this.toggleCommentEmptyState(true);
  }

  append(event) {
    if (!event || typeof event !== "object" || !this.listRoot) {
      return;
    }

    const commentId =
      typeof event.id === "string" && event.id.trim() ? event.id.trim() : "";
    if (!commentId || this.commentNodes.has(commentId)) {
      return;
    }

    if (event.profile && typeof event.pubkey === "string") {
      this.mergeCommentProfile(event.pubkey, event.profile);
    }

    const parentId = this.extractParentCommentId(event);
    const parentNode =
      parentId && this.commentNodes.has(parentId)
        ? this.commentNodes.get(parentId)
        : null;
    const depth = parentNode
      ? Math.max(0, Number(parentNode.dataset?.commentDepth) || 0) + 1
      : 0;

    const node = this.createCommentNode(event, { depth });
    if (!node) {
      return;
    }

    const container = this.getCommentChildrenContainer(parentId);
    if (!container) {
      this.logger.log("[VideoModal] Missing container for appended comment", parentId);
      return;
    }

    this.insertCommentNodeSorted(container, node);
    this.updateCommentCount(this.commentNodes.size);
    this.toggleCommentEmptyState(this.commentNodes.size === 0);
  }

  insertCommentNodeSorted(container, node) {
    if (!container || !node) {
      return;
    }

    const timestamp = Number(node.dataset.timestamp || 0);
    let inserted = false;

    const children = container.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const childTimestamp = Number(child.dataset.timestamp || 0);

      if (childTimestamp > timestamp) {
        container.insertBefore(node, child);
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      container.appendChild(node);
    }
  }

  buildCommentTree(commentId, commentsMap, childrenMap, depth = 0) {
    const normalizedId =
      typeof commentId === "string" && commentId.trim()
        ? commentId.trim()
        : "";
    if (!normalizedId) {
      return null;
    }

    const event = commentsMap.get(normalizedId);
    if (!event) {
      return null;
    }

    const node = this.createCommentNode(event, { depth });
    if (!node) {
      return null;
    }

    const repliesContainer = this.commentChildLists.get(normalizedId);
    if (repliesContainer) {
      const childIds = this.getChildCommentIds(childrenMap, normalizedId);
      if (childIds.length) {
        const fragment = this.document.createDocumentFragment();
        childIds.forEach((childId) => {
          const childNode = this.buildCommentTree(
            childId,
            commentsMap,
            childrenMap,
            depth + 1
          );
          if (childNode) {
            fragment.appendChild(childNode);
          }
        });
        if (fragment.childNodes.length) {
          repliesContainer.appendChild(fragment);
        }
      }
    }

    return node;
  }

  createCommentNode(event, { depth = 0 } = {}) {
    if (!event || typeof event !== "object") {
      return null;
    }

    const commentId =
      typeof event.id === "string" && event.id.trim() ? event.id.trim() : "";
    if (!commentId) {
      return null;
    }

    if (this.commentNodes.has(commentId)) {
      return this.commentNodes.get(commentId);
    }

    const { listItem, replies, elements } = this.nodeFactory.createCommentNode(event, { depth });

    this.commentNodes.set(commentId, listItem);
    this.commentChildLists.set(commentId, replies);
    this.commentNodeElements.set(commentId, elements);

    this.updateCommentNodeProfile(commentId, event.pubkey);

    return listItem;
  }

  updateCommentNodeProfile(commentId, pubkey) {
    if (!(this.commentNodeElements instanceof Map)) {
      this.commentNodeElements = new Map();
    }

    if (!commentId || !this.commentNodeElements.has(commentId)) {
      return;
    }

    const refs = this.commentNodeElements.get(commentId);
    const profile = this.getCommentAuthorProfile(pubkey);

    this.nodeFactory.updateCommentNodeProfile(
        refs,
        profile,
        this.commentAvatarCache,
        this.commentAvatarFailures
    );
  }

  updateCommentNodesForAuthor(pubkey) {
    if (typeof pubkey !== "string" || !pubkey.trim()) {
      return;
    }
    const normalized = pubkey.trim().toLowerCase();
    this.commentNodes.forEach((node, id) => {
      const author =
        typeof node?.dataset?.commentAuthor === "string"
          ? node.dataset.commentAuthor.trim().toLowerCase()
          : "";
      if (author && author === normalized) {
        this.updateCommentNodeProfile(id, pubkey);
      }
    });
  }

  getCommentAuthorName(pubkey) {
    return this.getCommentAuthorProfile(pubkey).displayName;
  }

  getCommentAvatarInitial(pubkey) {
    return this.getCommentAuthorProfile(pubkey).initial;
  }

  getCommentAuthorProfile(pubkey) {
    const normalized =
      typeof pubkey === "string" && pubkey.trim() ? pubkey.trim() : "";
    const profileEntry = normalized
      ? this.commentProfiles.get(normalized.toLowerCase()) || null
      : null;

    const rawPicture =
      profileEntry && typeof profileEntry.picture === "string"
        ? profileEntry.picture
        : "";
    const sanitizedPicture = sanitizeProfileMediaUrl(rawPicture);
    const avatar = this.resolveCommentAvatarAsset(normalized, sanitizedPicture);

    let npub = "";
    if (profileEntry && typeof profileEntry.npub === "string") {
      const trimmed = profileEntry.npub.trim();
      if (trimmed) {
        if (trimmed.startsWith("npub")) {
          npub = trimmed;
        } else if (HEX64_REGEX.test(trimmed)) {
          npub = this.encodeCommentPubkeyToNpub(trimmed);
        }
      }
    }

    if (!npub && profileEntry && typeof profileEntry.pubkey === "string") {
      const trimmed = profileEntry.pubkey.trim();
      if (trimmed) {
        npub = this.encodeCommentPubkeyToNpub(trimmed);
      }
    }

    if (!npub && normalized) {
      npub = this.encodeCommentPubkeyToNpub(normalized);
    }

    let displayName = "";
    if (profileEntry && typeof profileEntry === "object") {
      const candidates = [
        profileEntry.display_name,
        profileEntry.name,
        profileEntry.username,
      ];
      for (const candidate of candidates) {
        if (typeof candidate !== "string") {
          continue;
        }
        const trimmed = candidate.trim();
        if (trimmed) {
          displayName = trimmed;
          break;
        }
      }
    }

    if (displayName && HEX64_REGEX.test(displayName)) {
      displayName = "";
    }

    if (!displayName && npub && this.helpers.formatShortNpub) {
      displayName = this.helpers.formatShortNpub(npub);
    }

    if (!displayName) {
      displayName = "Anonymous";
    }

    const shortNpub = npub && this.helpers.formatShortNpub ? this.helpers.formatShortNpub(npub) : "";
    const initialCandidate = displayName.trim().charAt(0) || "";
    const initial = initialCandidate ? initialCandidate.toUpperCase() : "?";

    return {
      displayName,
      avatarUrl: avatar.url,
      avatarSource: avatar.source,
      npub,
      shortNpub,
      initial,
    };
  }

  resolveCommentAvatarAsset(pubkey, sanitizedPicture) {
    return resolveCommentAvatarAssetUtil({
      cache: this.commentAvatarCache,
      failures: this.commentAvatarFailures,
      defaultAvatar: this.DEFAULT_PROFILE_AVATAR,
      pubkey,
      sanitizedPicture,
    });
  }

  normalizeCommentAvatarKey(value) {
    return normalizeCommentAvatarKeyUtil(value);
  }

  encodeCommentPubkeyToNpub(pubkey) {
    if (typeof pubkey !== "string") {
      return "";
    }

    const trimmed = pubkey.trim();
    if (!trimmed) {
      return "";
    }

    if (trimmed.startsWith("npub1")) {
      return trimmed;
    }

    if (!HEX64_REGEX.test(trimmed)) {
      return "";
    }

    if (this.commentNpubEncodingFailures.has(trimmed)) {
      return "";
    }

    try {
      const encoded = this.window?.NostrTools?.nip19?.npubEncode?.(trimmed);
      if (typeof encoded === "string" && encoded) {
        return encoded;
      }
    } catch (error) {
      if (!this.commentNpubEncodingFailures.has(trimmed)) {
        this.logger.log("[VideoModal] Failed to encode comment author pubkey", error);
      }
    }

    this.commentNpubEncodingFailures.add(trimmed);
    return "";
  }

  normalizeCommentMap(candidate) {
    if (candidate instanceof Map) {
      return new Map(candidate);
    }
    if (Array.isArray(candidate)) {
      const map = new Map();
      candidate.forEach(([key, value]) => {
        if (typeof key === "string" && key.trim()) {
          map.set(key.trim(), value);
        }
      });
      return map;
    }
    if (candidate && typeof candidate === "object") {
      const map = new Map();
      Object.entries(candidate).forEach(([key, value]) => {
        if (typeof key === "string" && key.trim()) {
          map.set(key.trim(), value);
        }
      });
      return map;
    }
    return new Map();
  }

  normalizeChildrenMap(candidate) {
    const map = new Map();
    if (candidate instanceof Map) {
      candidate.forEach((value, key) => {
        map.set(this.normalizeParentKey(key), this.normalizeIdList(value));
      });
      return map;
    }
    if (Array.isArray(candidate)) {
      candidate.forEach(([key, value]) => {
        map.set(this.normalizeParentKey(key), this.normalizeIdList(value));
      });
      return map;
    }
    if (candidate && typeof candidate === "object") {
      Object.entries(candidate).forEach(([key, value]) => {
        map.set(this.normalizeParentKey(key), this.normalizeIdList(value));
      });
    }
    return map;
  }

  normalizeProfileMap(candidate) {
    const map = new Map();
    if (candidate instanceof Map) {
      candidate.forEach((value, key) => {
        const normalizedKey =
          typeof key === "string" && key.trim() ? key.trim().toLowerCase() : "";
        if (normalizedKey) {
          map.set(normalizedKey, value);
        }
      });
      return map;
    }
    if (Array.isArray(candidate)) {
      candidate.forEach(([key, value]) => {
        const normalizedKey =
          typeof key === "string" && key.trim() ? key.trim().toLowerCase() : "";
        if (normalizedKey) {
          map.set(normalizedKey, value);
        }
      });
      return map;
    }
    if (candidate && typeof candidate === "object") {
      Object.entries(candidate).forEach(([key, value]) => {
        const normalizedKey =
          typeof key === "string" && key.trim() ? key.trim().toLowerCase() : "";
        if (normalizedKey) {
          map.set(normalizedKey, value);
        }
      });
    }
    return map;
  }

  normalizeIdList(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((entry) =>
        typeof entry === "string" && entry.trim() ? entry.trim() : ""
      )
      .filter(Boolean);
  }

  normalizeParentKey(value) {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (
        !trimmed ||
        trimmed === "null" ||
        trimmed === "undefined" ||
        trimmed === "__root__"
      ) {
        return null;
      }
      return trimmed;
    }
    return this.normalizeParentKey(String(value));
  }

  getChildCommentIds(childrenMap, parentId) {
    const key = this.normalizeParentKey(parentId);
    const list = childrenMap.get(key);
    return Array.isArray(list) ? [...list] : [];
  }

  getCommentChildrenContainer(parentId) {
    const key = this.normalizeParentKey(parentId);
    if (key === null) {
      return this.commentChildLists.get(null) || this.listRoot;
    }
    if (this.commentChildLists.has(key)) {
      return this.commentChildLists.get(key);
    }
    const parentNode = this.commentNodes.get(key);
    if (parentNode) {
      const existing = parentNode.querySelector("[data-comment-replies]");
      if (existing) {
        this.commentChildLists.set(key, existing);
        return existing;
      }
    }
    return this.commentChildLists.get(null) || this.listRoot;
  }

  extractParentCommentId(event) {
    const tags = Array.isArray(event?.tags) ? event.tags : [];
    const values = [];
    for (const tag of tags) {
      if (!Array.isArray(tag) || tag.length < 2) {
        continue;
      }
      const [name, value] = tag;
      if (name !== "e") {
        continue;
      }
      const normalized = typeof value === "string" ? value.trim() : "";
      if (!normalized || normalized === this.commentThreadContext.videoEventId) {
        continue;
      }
      values.push(normalized);
    }
    if (!values.length) {
      return null;
    }
    return values[values.length - 1];
  }

  mergeCommentProfile(pubkey, profile) {
    if (typeof pubkey !== "string" || !pubkey.trim()) {
      return;
    }
    const normalized = pubkey.trim().toLowerCase();
    this.commentProfiles.set(normalized, profile);
    this.updateCommentNodesForAuthor(pubkey);
  }

  updateCommentCount(count) {
    if (!this.countLabel) {
      return;
    }
    const numeric = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    const label = numeric === 1 ? "1 comment" : `${numeric} comments`;
    this.countLabel.textContent = label;
  }

  toggleCommentEmptyState(isEmpty) {
    const shouldShow = Boolean(isEmpty);
    if (this.emptyState) {
      if (shouldShow) {
        this.emptyState.removeAttribute("hidden");
      } else {
        this.emptyState.setAttribute("hidden", "");
      }
    }
    if (this.listRoot) {
      if (shouldShow) {
        this.listRoot.setAttribute("data-empty", "true");
      } else {
        this.listRoot.removeAttribute("data-empty");
      }
    }
  }
}
