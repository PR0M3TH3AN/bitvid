const INTERFACE_ANIMATION = "interface-fade-in";
const THUMBNAIL_ANIMATION = "video-thumbnail-fade-in";
const registrations = new WeakMap();

function clearInterfaceFade(target) {
  if (!target.classList.contains("fade-in")) return;
  target.classList.remove("fade-in");
  for (const className of Array.from(target.classList)) {
    if (className.startsWith("fade-in-delay-")) target.classList.remove(className);
  }
}

// Install before reconciling: initial CSS animation events can precede the
// application module's evaluation. Finished forwards-fill effects still appear
// in getAnimations() and retain their stacking context until the class is gone.
export function initializeFadeInCleanup(doc = document) {
  if (registrations.has(doc)) return registrations.get(doc);
  const isElement = (target) => target instanceof doc.defaultView.HTMLElement;
  const onComplete = ({ animationName, target, pseudoElement }) => {
    if (!isElement(target) || pseudoElement) return;
    if (animationName === INTERFACE_ANIMATION) {
      clearInterfaceFade(target);
    } else if (
      animationName === THUMBNAIL_ANIMATION &&
      target.dataset.videoThumbnail === "true" &&
      target.dataset.thumbnailLoaded === "true"
    ) {
      delete target.dataset.thumbnailLoaded;
    }
  };
  doc.addEventListener("animationend", onComplete, true);
  doc.addEventListener("animationcancel", onComplete, true);
  const dispose = () => {
    doc.removeEventListener("animationend", onComplete, true);
    doc.removeEventListener("animationcancel", onComplete, true);
    if (registrations.get(doc) === dispose) registrations.delete(doc);
  };
  registrations.set(doc, dispose);

  // No duration guesses or timers: running, delayed and paused entrances must
  // keep their classes. Unsupported animation inspection retains event cleanup.
  const animations = typeof doc.getAnimations === "function" ? doc.getAnimations() : [];
  const interfaceAnimations = animations.filter((animation) =>
    animation.animationName === INTERFACE_ANIMATION &&
    isElement(animation.effect?.target) && !animation.effect.pseudoElement
  );
  for (const animation of interfaceAnimations) {
    const target = animation.effect.target;
    if (
      animation.playState === "finished" &&
      !interfaceAnimations.some((other) =>
        other.effect.target === target && other.playState !== "finished"
      )
    ) {
      clearInterfaceFade(target);
    }
  }
  return dispose;
}
