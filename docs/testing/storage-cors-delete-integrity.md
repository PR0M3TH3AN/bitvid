# storage-cors-2 best-effort delete metadata guard

Dispatch independently reproduced2 rejected calls vs0 required with6 controls, then routed15:06:18UTC. Only deleteVideoStorage in r2Service.js changes. Input shape/owner identifiers and string connection fields are validated before trimming or SDK client construction. Nonstring metadata returns invalid-connection; nonstring owners return invalid-owner; absent/null/non-object options return existing no-videos skip. Primitive string trimming/default behavior remains. No coercion of arbitrary objects.

Actual affected counterpart check: `s3UploadService.js` has NO deleteVideoStorage counterpart. Shared provider-aware R2Service delete already chooses makeR2Client versus makeS3Client. Both real wrapper branches are exercised with transport fakes; forcePathStyle/endpoint/region preserved. No duplicated upload/key/magnet logic changes in either service.

```yaml
test_integrity_note:
  change_type: ["new_tests"]
  scenarios:
    - id: SCN-storage-delete-malformed-cache
      given: "synthetic persisted locked R2 metadata with numeric bucket or object base URL"
      when: "actual StorageService listing and R2Service connection resolution feed deleteVideoStorage"
      then: "structured invalid-connection skip, no client construction or object requests"
    - id: SCN-storage-delete-direct-types
      given: "nonstring direct credentials fields/owners or null/non-object options"
      when: "real cleanup method is invoked"
      then: "safe structured skip with zero IO and no object trimming/coercion"
    - id: SCN-storage-delete-provider-safety
      given: "valid R2 or generic-S3 connection with owned/external/prefix-sibling URLs, locked storage or partial delete failure"
      when: "actual cleanup/key collector/SDK wrapper/deleteObject run"
      then: "only owned media/torrent/thumbnail delete; provider settings retained; lock reasons correct; partial errors recorded and later objects continue"
  observable_outcomes:
    - "exact summaries, zero SDK constructions/requests for unsafe input, exact deletion keys/bucket/config and per-object failure"
  determinism_controls:
    - "synthetic _getAccount persistence IO; real connection resolution/mapping"
    - "local remote-SDK replacement/recording transport; actual key collector and deleteObject; no real credentials/network"
    - "no retries/sleeps/timeouts in retained regression"
  anti_cheat_rationale:
    prevents:
      - "constant skip/no-op"
      - "over-mocked service logic"
      - "unsafe object coercion and cross-base deletion"
      - "hidden partial failures or lost provider settings"
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: ""
```

Atac99ae9a6bdbeae555a30f659b0720ae67e777e8,13 new scenarios pass. Original method fails9/13 (each malformed cached field, each of5direct fields, owner types, null options). Seven restored mutants rejected: remove settings guard(scenarios1–7); remove owner guard(8); null destructure(9); force wrong provider(10); bypass owner key collector(10–13); bypass lock guard(12); rethrow partial error(13). Every scenario is killed. No existing assertions changed.

Focused existing+new runner4/4 files,24scenarios; lint11/11 and build/deploy-artifact exit0. Product scope29-line diff in one method. Pre-existing note-deletion callers catch cleanup exceptions,so this does not claim note deletion was blocked. Raw cloud/IAM/SDK serialization,actual malformed user records and arbitrary throwing JS proxies/getters are unverified. No real bucket/delete/signer/private-data/preview action. Feed3 remains deferred with invalid seed fixture preserved; no feed finding. Full/normal landing awaits dispatch slot.

Timing: storage-audit acknowledgement14:59:46UTC; evidence15:01:20UTC; fix route15:06:18UTC (298s routing wait); ready15:08:52UTC. Metadata claim followed verified unstable merge; no metadata wait blocked read-only investigation.

Merged validation at020f0577ee5fb212a689bb06260f10abd47e4868:full430/430 files exit0 (NODE_TEST_CONTEXT unset,UNIT_TEST_TIMEOUT_MS60000),focused4files/24scenarios,lint11/build-artifact pass. Product7b8100a6 committed before required merge. Slot request15:08:52→grant15:09:29UTC37s;full confirmed15:15:59UTC. Normal queue pending. No product edits after mutant proof.

## Durable completion
Submission1650b3439fee7d419b68a0badcee67cee0cfa9aa durably landed2026-10-20T15:22:48.611Z ase7b9afb309d822fca9fdc1cc31e79ce7c9c33fbe. Unchanged normal install/npm-test gate exit0. Both submission and landedSHA ancestry on unstable exit0. Newer dispatch docs tip1b3ef49c was already on unstable by final log read;product remains ancestor,not necessarily latest tip. Backlog closed only after durable result and ancestry. Resource release notification actual15:23:08UTC;normal queue wait/gate15:16:23.181→15:22:48.611(~385s). Final notes only;then idle per owner local-review milestone. No extra optional feed item starts;deferred feed3 remains queued for future routing.
