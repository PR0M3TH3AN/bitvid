import { UI_FEEDBACK_DELAY_MS } from "../../../constants.js";
import { formatAbsoluteTimestamp, formatTimeAgo } from "../../../utils/formatters.js";
import { registerCommentAvatarFailure as registerCommentAvatarFailureUtil } from "./utils/commentAvatar.js";

export class CommentNodeFactory {
  constructor({ document, window, logger, dispatch, DEFAULT_PROFILE_AVATAR }) {
    this.document = document;
    this.window = window;
    this.logger = logger;
    this.dispatch = dispatch;
    this.DEFAULT_PROFILE_AVATAR = DEFAULT_PROFILE_AVATAR;
  }

  createCommentNode(event, { depth = 0 } = {}) {
    if (!event || typeof event !== "object" || !this.document) {
      return null;
    }

    const commentId =
      typeof event.id === "string" && event.id.trim() ? event.id.trim() : "";
    if (!commentId) {
      return null;
    }

    const listItem = this.document.createElement("li");
    listItem.classList.add("comment-thread__item");
    listItem.dataset.commentId = commentId;
    listItem.dataset.commentDepth = String(Math.max(0, depth));
    listItem.dataset.timestamp = String(
      Number.isFinite(event.created_at) ? event.created_at : 0
    );
    if (typeof event.pubkey === "string" && event.pubkey.trim()) {
      listItem.dataset.commentAuthor = event.pubkey.trim();
    }

    const avatarWrapper = this.document.createElement("div");
    avatarWrapper.classList.add("comment-thread__avatar");

    const avatarImg = this.document.createElement("img");
    avatarImg.hidden = true;
    avatarImg.loading = "lazy";
    avatarImg.decoding = "async";
    avatarWrapper.appendChild(avatarImg);

    const avatarLabel = this.document.createElement("span");
    avatarWrapper.appendChild(avatarLabel);

    const content = this.document.createElement("div");
    content.classList.add("comment-thread__content");

    const meta = this.document.createElement("div");
    meta.classList.add("comment-thread__meta");

    const authorEl = this.document.createElement("span");
    authorEl.classList.add("comment-thread__author");
    meta.appendChild(authorEl);

    const timestamp = this.getCommentTimestampLabel(event.created_at);
    if (timestamp.text) {
      const timeEl = this.document.createElement("time");
      timeEl.classList.add("comment-thread__timestamp");
      if (timestamp.iso) {
        timeEl.setAttribute("datetime", timestamp.iso);
      }
      if (timestamp.title) {
        timeEl.title = timestamp.title;
      }
      timeEl.appendChild(this.document.createTextNode(timestamp.text));
      meta.appendChild(timeEl);
    }

    content.appendChild(meta);

    const identityMeta = this.document.createElement("div");
    identityMeta.classList.add(
      "flex",
      "items-center",
      "gap-2",
      "text-2xs",
      "text-muted-strong"
    );
    identityMeta.hidden = true;
    const npubLabel = this.document.createElement("span");
    npubLabel.classList.add("truncate");
    identityMeta.appendChild(npubLabel);
    content.appendChild(identityMeta);

    const body = this.document.createElement("p");
    body.classList.add("comment-thread__body");
    body.appendChild(
      this.document.createTextNode(
        typeof event.content === "string" ? event.content : ""
      )
    );
    content.appendChild(body);

    const actions = this.document.createElement("div");
    actions.classList.add("comment-thread__actions");

    const copyButton = this.document.createElement("button");
    copyButton.type = "button";
    copyButton.classList.add("comment-thread__copy-npub");
    copyButton.textContent = "Copy npub";
    copyButton.dataset.originalLabel = "Copy npub";
    copyButton.hidden = true;
    this.bindCommentCopyHandler(copyButton);
    actions.appendChild(copyButton);

    const muteButton = this.document.createElement("button");
    muteButton.type = "button";
    muteButton.classList.add("comment-thread__mute");
    muteButton.appendChild(this.document.createTextNode("Mute author"));
    muteButton.addEventListener("click", (domEvent) => {
      const triggerElement = domEvent?.currentTarget || muteButton;
      this.dispatch("comment:mute-author", {
        commentId,
        pubkey:
          typeof event.pubkey === "string" && event.pubkey
            ? event.pubkey
            : "",
        triggerElement,
      });
    });
    actions.appendChild(muteButton);

    content.appendChild(actions);

    const replies = this.document.createElement("ul");
    replies.classList.add("comment-thread__replies");
    replies.setAttribute("data-comment-replies", "");
    content.appendChild(replies);

    listItem.appendChild(avatarWrapper);
    listItem.appendChild(content);

    return {
      listItem,
      replies,
      elements: {
        avatarImg,
        avatarLabel,
        authorEl,
        npubContainer: identityMeta,
        npubLabel,
        copyButton,
      }
    };
  }

  getCommentTimestampLabel(createdAt) {
    const numeric = Number(createdAt);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return { text: "", iso: "", title: "" };
    }

    const date = new Date(numeric * 1000);
    if (Number.isNaN(date.getTime())) {
      return { text: "", iso: "", title: "" };
    }

    let text = "";
    try {
      text = formatTimeAgo(numeric);
    } catch (error) {
      this.logger.log("[VideoModal] Failed to format comment timestamp", error);
    }
    if (!text) {
      text = formatAbsoluteTimestamp(numeric);
    }

    return {
      text,
      iso: date.toISOString(),
      title: formatAbsoluteTimestamp(numeric),
    };
  }

  bindCommentCopyHandler(button) {
    if (!button) {
      return;
    }

    button.addEventListener("click", async () => {
      const npub =
        typeof button.dataset.npub === "string" && button.dataset.npub
          ? button.dataset.npub
          : "";
      const originalLabel =
        typeof button.dataset.originalLabel === "string" &&
        button.dataset.originalLabel
          ? button.dataset.originalLabel
          : "Copy npub";
      if (!button.dataset.originalLabel) {
        button.dataset.originalLabel = originalLabel;
      }

      if (!npub) {
        this.showCommentCopyFeedback(button, "Copy failed", "error");
        return;
      }

      try {
        const clipboard = this.window?.navigator?.clipboard;
        if (!clipboard || typeof clipboard.writeText !== "function") {
          throw new Error("Clipboard unavailable");
        }
        await clipboard.writeText(npub);
        this.showCommentCopyFeedback(button, "Copied!", "copied");
      } catch (error) {
        this.logger.log("[VideoModal] Failed to copy comment npub", error);
        this.showCommentCopyFeedback(button, "Copy failed", "error");
      }
    });
  }

  showCommentCopyFeedback(button, message, state = "") {
    if (!button) {
      return;
    }

    const originalLabel =
      typeof button.dataset.originalLabel === "string" &&
      button.dataset.originalLabel
        ? button.dataset.originalLabel
        : "Copy npub";

    button.textContent = message;
    if (state) {
      button.dataset.state = state;
    } else if (button.dataset.state) {
      delete button.dataset.state;
    }

    const timeoutId = Number.parseInt(
      button.dataset.feedbackTimeoutId || "",
      10
    );
    if (
      Number.isFinite(timeoutId) &&
      this.window &&
      typeof this.window.clearTimeout === "function"
    ) {
      this.window.clearTimeout(timeoutId);
    }

    if (!this.window || typeof this.window.setTimeout !== "function") {
      button.textContent = button.dataset.originalLabel || originalLabel;
      if (button.dataset.feedbackTimeoutId) {
        delete button.dataset.feedbackTimeoutId;
      }
      return;
    }

    const nextId = this.window.setTimeout(() => {
      button.textContent = button.dataset.originalLabel || originalLabel;
      if (button.dataset.state) {
        delete button.dataset.state;
      }
      if (button.dataset.feedbackTimeoutId) {
        delete button.dataset.feedbackTimeoutId;
      }
    }, UI_FEEDBACK_DELAY_MS);

    button.dataset.feedbackTimeoutId = String(nextId);
  }

  updateCommentNodeProfile(refs, profile, cache, failures) {
    if (!refs) {
      return;
    }

    if (refs.authorEl) {
      refs.authorEl.textContent = profile.displayName;
    }

    if (refs.avatarLabel) {
      refs.avatarLabel.textContent = profile.initial;
      refs.avatarLabel.hidden = Boolean(profile.avatarUrl);
    }

    if (refs.avatarImg) {
      if (!refs.avatarImg.dataset.commentAvatarBound) {
        const labelRef = refs.avatarLabel;
        const imgRef = refs.avatarImg;
        refs.avatarImg.addEventListener("error", () => {
          const failedSource =
            typeof imgRef?.dataset?.commentAvatarSource === "string"
              ? imgRef.dataset.commentAvatarSource
              : "";
          if (failedSource) {
            registerCommentAvatarFailureUtil({
                cache,
                failures,
                defaultAvatar: this.DEFAULT_PROFILE_AVATAR,
                sourceUrl: failedSource,
            });
          }
          if (
            imgRef &&
            imgRef.dataset.commentAvatarCurrent !== this.DEFAULT_PROFILE_AVATAR
          ) {
            imgRef.dataset.commentAvatarCurrent = this.DEFAULT_PROFILE_AVATAR;
            imgRef.src = this.DEFAULT_PROFILE_AVATAR;
            return;
          }
          if (imgRef) {
            imgRef.hidden = true;
          }
          if (labelRef) {
            labelRef.hidden = false;
          }
        });
        refs.avatarImg.dataset.commentAvatarBound = "true";
      }

      const nextSource = profile.avatarSource || "";
      refs.avatarImg.dataset.commentAvatarSource = nextSource;

      if (profile.avatarUrl) {
        if (
          refs.avatarImg.dataset.commentAvatarCurrent !== profile.avatarUrl
        ) {
          refs.avatarImg.dataset.commentAvatarCurrent = profile.avatarUrl;
          refs.avatarImg.src = profile.avatarUrl;
        }
        refs.avatarImg.alt = `${profile.displayName}'s avatar`;
        refs.avatarImg.hidden = false;
        if (refs.avatarLabel) {
          refs.avatarLabel.hidden = true;
        }
      } else {
        if (
          refs.avatarImg.dataset.commentAvatarCurrent !==
          this.DEFAULT_PROFILE_AVATAR
        ) {
          refs.avatarImg.dataset.commentAvatarCurrent =
            this.DEFAULT_PROFILE_AVATAR;
          refs.avatarImg.src = this.DEFAULT_PROFILE_AVATAR;
        }
        refs.avatarImg.hidden = true;
        if (refs.avatarLabel) {
          refs.avatarLabel.hidden = false;
        }
      }
    }

    if (refs.npubContainer) {
      if (profile.shortNpub) {
        refs.npubContainer.hidden = false;
        if (refs.npubLabel) {
          refs.npubLabel.textContent = profile.shortNpub;
          if (profile.npub) {
            refs.npubLabel.title = profile.npub;
          } else if (refs.npubLabel.title) {
            refs.npubLabel.removeAttribute("title");
          }
        }
      } else {
        refs.npubContainer.hidden = true;
        if (refs.npubLabel) {
          refs.npubLabel.textContent = "";
          if (refs.npubLabel.title) {
            refs.npubLabel.removeAttribute("title");
          }
        }
      }
    }

    if (refs.copyButton) {
      const originalLabel =
        typeof refs.copyButton.dataset.originalLabel === "string" &&
        refs.copyButton.dataset.originalLabel
          ? refs.copyButton.dataset.originalLabel
          : "Copy npub";

      if (profile.npub) {
        refs.copyButton.hidden = false;
        refs.copyButton.disabled = false;
        refs.copyButton.dataset.npub = profile.npub;
        refs.copyButton.setAttribute(
          "aria-label",
          `Copy ${profile.displayName}'s npub`
        );
        refs.copyButton.textContent = originalLabel;
        if (refs.copyButton.dataset.state) {
          delete refs.copyButton.dataset.state;
        }
      } else {
        refs.copyButton.hidden = true;
        refs.copyButton.disabled = true;
        if (refs.copyButton.dataset.state) {
          delete refs.copyButton.dataset.state;
        }
        if (refs.copyButton.dataset.npub) {
          delete refs.copyButton.dataset.npub;
        }
        refs.copyButton.removeAttribute("aria-label");
        refs.copyButton.textContent = originalLabel;
      }
    }
  }
}
