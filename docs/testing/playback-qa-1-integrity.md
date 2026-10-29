# playback-qa-1 test integrity

Approved by dispatch mailbox `20261020T134149-dispatch-c71c3f.md`.
Scope: new dependency-free `tests/fleet-playback-fallback.test.mjs`; no existing expectations changed.

```yaml
test_integrity_note:
  change_type: ["new_tests"]
  scenarios:
    - id: SCN-playback-primary-404
      given: "dual-source video; primary probe returns definitive 404"
      when: "actual app coordinator invokes strategy and playback session"
      then: "torrent selected once; literal hash and original/hosted webseeds preserved; source/UI state and session settle"
    - id: SCN-playback-primary-media-error
      given: "dual-source video; successful probe followed by media error and stalled events"
      when: "actual playback watchdog receives the failures"
      then: "torrent selected once with preserved handoff and cleared session"
    - id: SCN-playback-viable-mirror
      given: "primary 404 and duplicated viable hosted mirror"
      when: "actual playback orchestration tries sources"
      then: "mirror selected once, URL success/source surfaced, no torrent invocation"
    - id: SCN-playback-terminal-both-fail
      given: "primary 404 and alternate handler rejection"
      when: "actual playback orchestration runs"
      then: "promise settles with error/null source, one UI error, session/promise released"
  observable_outcomes:
    - "app source, returned source/error/alternate instance, status and surfaced errors"
    - "torrent boundary payload preserves exact original xt/hash and webseed hints"
    - "ordered probe/media attempts and exactly one alternate selection"
    - "no active app/strategy session or pending result after settlement"
  determinism_controls:
    - "fixed magnets/URLs; no sockets, peers, fetch or external service"
    - "EventTarget media double emits controlled playing/error/stalled events"
    - "probe and torrent IO controlled at injected app boundaries"
    - "real coordinator, strategy, PlaybackService, magnet derivation and validator"
    - "2s test failure bound; no sleeps/retries or replaced selection/watchdog logic"
  anti_cheat_rationale:
    prevents:
      - "hard-coded source/result without actual alternate invocation"
      - "over-mocking orchestration or magnet normalization"
      - "skipping viable mirror or duplicate alternate selection"
      - "hash corruption, lost hosted hint, suppressed UI error, unclosed session"
      - "snapshot rubber-stamping and retry/sleep-based flake masking"
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: ""
```

Six deliberate product mutations were made only in an isolated copy under `/tmp/bitvid-playback-qa-1/tree`.
Each failed exit1; originals were restored in finally, and the complete original suite passed4/4 again.

| Mutant | Scenarios rejecting it |
| --- | --- |
| Disable torrent alternate entirely |404, media error, both fail |
| Drop mirror forwarding in strategy |viable mirror |
| Lowercase handoff magnet, corrupting literal mixed-case hash |404, media error, both fail |
| Erase hostedUrlWebSeed hint |404, media error, both fail |
| Suppress terminal UI error |both fail |
| Retain strategy active session on finish |all4 |

Each new scenario rejects at least one mutant. No product mutation was committed.

Fidelity limits and native local decoding results: [evidence](playback-qa-1-evidence.md).
The retained media double validates orchestration, not a browser decoder or real WebTorrent.
