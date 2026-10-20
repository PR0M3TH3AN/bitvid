test_integrity_note:
  change_type: ["spec_correction", "new_tests"]
  scenarios:
    - id: SCN-active-media-last-owner
      given: "Actual observer/controller/cache has active video media and last registered owner"
      when: "Owner disposes; retained success/error/timeout callbacks arrive later"
      then: "Immediate media/listener/timer cleanup, null settlement, no cache or mirror or stale badge; cleanup once"
    - id: SCN-active-media-replacement
      given: "Final owner cancels active media"
      when: "Same-turn or after-flush fresh owner requests same source"
      then: "Fresh promise; old callbacks/finalizer cannot remove/cache/paint/release over replacement"
    - id: SCN-active-media-shared
      given: "Same/cross-controller or legacy ownerless consumer shares active media"
      when: "Old observer owner disposes"
      then: "One shared media/promise survives, live consumer gets healthy cache; final registered shared owner cancels exactly once"
    - id: SCN-active-media-fifo
      given: "Three active media, two live FIFO waiters"
      when: "Target last owner disposes while newcomer requests"
      then: "First waiter advances without completion/timeout, later waiter precedes newcomer, max3slots and final0"
    - id: SCN-active-media-live-timeout
      given: "Live owner needs media confirmation"
      when: "Initial timeout then retry succeeds or times out"
      then: "Normal retry/media cleanup and healthy/timeout cache reuse remain; live final error caches offline"
  observable_outcomes:
    - "Real media src/pause/load/listener/timer boundaries, promise result, FIFO source starts, badge/cache/inflight identity"
  determinism_controls:
    - "Real observer/controller/cache; fake IntersectionObserver, HEAD/media IO boundary, controlled timers; no public network"
    - "setImmediate event-loop flush, explicit media events and retained callback invocation; fixture restores globals/policy/DOM"
  anti_cheat_rationale:
    prevents:
      - "Skipping work for live shared consumers"
      - "Marking cancelled without releasing resources or settling"
      - "Caching cancelled results, retaining timers/listeners, double releasing slots"
      - "Joining cancelled records or overwriting replacements"
      - "FIFO disruption or suppressing live timeout retries"
  relaxation:
    did_relax_any_assertion: true
    if_true_explain_spec_basis: "Explicit authorized spec correction at3dac0afb replaces prior disposed active cache/rejoin allowances with stricter immediate cancellation/null/no-cache/new-record requirements, per Stage3 and owner continuation. Old cache expectations no longer apply after final-owner cancellation; separate live healthy/offline/timeout/cache controls retained. No weaker retries/sleeps/skips/timeouts. See docs/spec_changes/2026-10-20-client-reliability-8-active-media.md."

Mutant mapping (all restored, natural exit1,0cancelled):
- disable-active-cancel -> cleanup/same-turn/FIFO/timer/final-shared scenarios
- retain-src,retain-listener,retain-timer,skip-cleanup-load,skip-pause -> strict cleanup boundaries
- missing-sync-marker -> same-turn replacement/rejoin
- cache-on-cancel -> null/no-cache/fresh request
- cancel-shared-owner -> shared/cross/legacy/final-shared controls
- fifo-pop -> queued competition order
- double-cleanup -> late success/error/timeout and replacement slot/pause assertions
- obsolete-inflight-write -> same-turn/after-flush identity assertions (controller-local simulated obsolete cache write; cache module unchanged)
- skip-retry,force-offline-healthy -> live-owner retry/offline contract

14/14 rejected; no surviving mutants. /tmp/client8-mutants.json and /tmp/client8-mutant-*.log retain exact failures. Restored suite29/29 passes.
