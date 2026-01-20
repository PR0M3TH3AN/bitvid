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
} = {}) {
  if (!doc) {
    throw new Error("Avatar requires a document reference.");
  }

  const avatar = doc.createElement("div");

  const sizeClasses = {
    md: "dm-avatar--md",
    sm: "dm-avatar--sm",
  };
  const sizeClass = sizeClasses[size] || "dm-avatar--md";

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

  return avatar;
}
