// A focus trap (e.g. the profile modal's) must YIELD focus to any modal stacked on
// top of it — otherwise it yanks focus back and the stacked modal's fields (like the
// login modal's nsec passphrase/PIN input) can't be clicked or typed into.
//
// Returns true when the focus target lives inside a DIFFERENT open `.bv-modal` than the
// trapping modal — i.e. the trap should leave focus alone.
export function isInStackedModal(target, modalRoot) {
  if (!target || typeof target.closest !== "function") {
    return false;
  }
  const stacked = target.closest(".bv-modal:not(.hidden)");
  return Boolean(stacked && stacked !== modalRoot);
}
