import { applyAdminStar, isAdminActor } from "../adminBadge.js";

const DEFAULT_AVATAR_ALT = "Avatar";

function getInitials(label = "") {
  if (typeof label !== "string") {
    return "";
  }
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return "";
  }
  const initials = words.slice(0, 2).map((word) => word[0].toUpperCase());
  return initials.join("");
}

export function Avatar({
  document: doc,
  src = "",
  alt = DEFAULT_AVATAR_ALT,
  size = "md",
  initials = "",
  status = "",
  adminId = "",
} = {}) {
  if (!doc) {
    throw new Error("Avatar requires a document reference.");
  }

  const avatar = doc.createElement("div");
  // Explicit mapping ensures Tailwind scanner detects these classes
  const sizeClass = {
    sm: "dm-avatar--sm",
    md: "dm-avatar--md",
  }[size] || `dm-avatar--${size}`;

  avatar.className = `dm-avatar ${sizeClass}`;
  if (status) {
    avatar.dataset.status = status;
  }

  const resolvedInitials = initials || getInitials(alt);

  if (src) {
    const img = doc.createElement("img");
    img.className = "dm-avatar__image";
    img.alt = alt || DEFAULT_AVATAR_ALT;
    img.loading = "lazy";
    img.decoding = "async";
    img.src = src;
    avatar.appendChild(img);
  } else {
    const fallback = doc.createElement("span");
    fallback.className = "dm-avatar__fallback";
    fallback.textContent = resolvedInitials || "?";
    avatar.appendChild(fallback);
  }

  // The circular avatar clips its contents, so an admin star can't live inside
  // it. Only when the actor is an admin do we wrap the avatar in a non-clipped
  // relative container and hang the star off that — non-admin avatars are
  // returned exactly as before to keep existing layouts untouched.
  if (adminId && isAdminActor(adminId)) {
    const wrap = doc.createElement("span");
    wrap.className = "dm-avatar-wrap";
    wrap.appendChild(avatar);
    applyAdminStar(wrap, adminId, { doc });
    return wrap;
  }

  return avatar;
}
