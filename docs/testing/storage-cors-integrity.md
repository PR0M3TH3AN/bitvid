# storage-cors-1 investigation

Start UTC 2026-10-20T13:38:00Z. Investigation checkpoint 13:39:21Z.
HEAD bbc1be79e941add929c9c51f984778676822b5f2; filedAt0c1dd7e helper/client unchanged.

Actual caller behavior: R2Service.getCorsOrigins returns current window origin (plus HTTPS localhost counterpart). ensureBucketConfigForNpub and verifyPublicAccess use this list; generic prepareS3Connection takes supplied origins, and its getCorsOrigins likewise returns current-site origins. r2-s3 reexports the helper. Thus existing policies are not passed through callers.

Offline command `env -u NODE_TEST_CONTEXT node /tmp/storage-cors-reproduce.mjs` exit0, 5 characterization scenarios. Real s3-client and s3-multipart imported; registerHooks replaces only remote SDK with input-holding command classes; fake S3 send implements full-policy replacement on PutBucketCors. Unexpected HTTP imports throw. Fixtures use example.invalid and no credentials.

- Existing GET-only rule: origin first.example.invalid, header Range, ETag exposure, maxAge75, ID existing-read-only. Request second.example.invalid. Result retains0/1 prior rules; origins only second.example.invalid; helper default methods/headers replace prior fields.
- Repeat same request: policy identical, PUT total2 (no skip).
- No existing CORS config: PUT1/GET0, default policy installed.
- AccessDenied on read: PUT1/GET0; configured read error cannot surface because helper never reads.
- Empty origins: zero transport calls, policy untouched.

Proposed semantics sent dispatch: preserve all existing rules/fields verbatim; add default rule for new origins without widening arbitrary existing rules; skip PUT when exact equivalent default rules already satisfy all requested origins; only explicit NoSuchCORSConfiguration permits absent-policy creation; other read failures reject without PUT. Wildcards/unknown fields preserved; no speculative permission merging. Scope needs dispatch routing before implementation.

No regression test changes yet, so no Test Integrity Note/mutants claimed. No browser/full-suite/lint/build/cloud/live-policy/concurrency qualification. PR overlap check unavailable (curl DNS exit6). Preview3000 untouched. Tool/browser/gate contention before reproduction0s; routing wait starts13:39:21Z.

## Routed implementation and integrity (2026-10-20T13:43Z)

Dispatch routed bounded product/test fix at13:40:50UTC after independent failure. Routing wait89s. Existing rules remain verbatim/in order; only explicit origins in rules with identical default permission/header/exposure/maxAge fields count as covered. ID is preserved metadata; unknown fields disqualify coverage. Wildcards remain unchanged and are not expanded/interpreted. Append current defaults for uncovered deduplicated origins. Only NoSuchCORSConfiguration permits creation after failed read; denied/404/transport failures propagate without PUT. Existing method defaults unchanged, no SDK upgrade.

```yaml
test_integrity_note:
  change_type: ["new_tests"]
  scenarios:
    - id: SCN-storage-cors-preservation
      given: "existing custom or wildcard rules, or equivalent default coverage"
      when: "real ensureBucketCors adds/repeats requested origins through actual SDK wrapper"
      then: "all original rules and fields persist; only uncovered explicit origins get default rule; repeats issue no PUT"
    - id: SCN-storage-cors-read-safety
      given: "absent configuration, denied read, non-CORS 404, transport failure, or empty origins"
      when: "real helper configures CORS"
      then: "only explicit NoSuchCORSConfiguration creates policy; other read errors propagate identically with zero PUT; empty origins zero IO"
  observable_outcomes:
    - "full persisted CORS policy, unchanged rule fields/order, exact write count, original error identity"
  determinism_controls:
    - "actual helper and SDK wrapper; fake remote SDK command classes and S3 transport; no network, credentials, clock, retries, sleeps"
  anti_cheat_rationale:
    prevents:
      - "hard-coded success/no-op"
      - "over-mocking internal helper logic"
      - "policy overwrite or arbitrary permission widening"
      - "snapshot rubber-stamping and retry/sleep masking"
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: ""
```

Nine regression scenarios pass. Original helper fails8/9 with exit1; empty-origin control passes. Ten deliberately broken variants exit1 and were restored: overwrite existing rules; reverse rules; omit dedup; repeat PUT; include covered origins; reject absent policy; swallow read errors; empty-origins IO; ignore non-origin permissions (kills scenario5); remove SDK GetBucketCors export. Every scenario fails under at least one variant. Final focused runner passes3/3 files (13 scenarios total:9 CORS,3 cache-control,1 empty upload).

`npm ci --offline --ignore-scripts`: exit0,441 installed packages in4s from local cache. Initial lint exit127 absent stylelint; after install lint exit2 sandbox EPERM read-only git subprocess. Unchanged lint with sandbox permission exits0,11 checks. `npm run build`: exit0 incl dist artifact verification. No dependency file changes. Normal full-suite/landing slot reserved after client; awaiting explicit grant. Cloud IAM permissions, actual provider response serialization, concurrent read-modify-write races, browser/live playback remain unverified. Read-modify-write has no provider CAS guarantee and concurrent writers can still race.

Final merged gate atbfa36a3f350d6a9751a1a43c83fc890c855091fc: full normal runner428/428 files exit0 with UNIT_TEST_TIMEOUT_MS=60000/NODE_TEST_CONTEXT unset; focused3/3 files(13 scenarios),lint11 checks,build/artifact pass. Resource wait949s before13:58:27UTC grant; full completed14:03:49UTC. No product changes since restored mutants. Normal landing pending; no real-cloud/concurrent-writer claim.
