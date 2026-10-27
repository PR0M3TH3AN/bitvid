# Client10 decisions

- Extract only existing animationcleanup block into59line ui/fadeInCleanup helper; index1456→1405lines. No other bootstrap/CSS/app files changed. Existing thumbnail eligibility retained on end/cancel; pseudo effects are excluded from element cleanup.
- Install one capture listenerpair then query Document.getAnimations once for already-finished own-target interface CSS animations. Skip running/paused/idle effects and finished effects with same-target live counterpart. No elapsedtime guesses/timers/MutationObserver/layout reads/promises to retain.
- Unsupported animation inspection retains event-based cleanup; reducedmotion animation:none retains original hooks without animation effects or new motion. No unsupported-browser late-recovery guarantee. Reference https://www.w3.org/TR/web-animations-1/ describes relevant finished/filling effects and stacking contexts.
- Per-document WeakMap makes repeated init idempotent and gives safe explicit disposal/reinstall. Stale disposer cannot erase replacement registration.
- Focused scenarios use real helper/JSDOM and controlled CSSAnimation metadata; wiring executes real isolated indexcleanup statements with actual imported helper, not fullapp/bootstrap dependencies. Native CSS animation/hit-testing requires later granted QA. Preserve originaloverflow362/360+394/390 and live/wholeStage3 boundaries.
