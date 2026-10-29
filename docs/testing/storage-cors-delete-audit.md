# storage-cors-2 current delete-safety audit

Started2026-10-20T14:59:46UTC after dispatch priority correction. HEADd88716e3c6351468a53bc7fdb84fe912c01697b5. Product/existing tests read-only. Assignment metadata queued behind QA normal gate; dispatch authorizes read-only audit before claim visibility.

Plan: inspect actual service/caller/normalization and existing scenarios; drive real service with fake SDK/transport and synthetic persistence records; establish owned/external/locked/partial controls; report demonstrated loss/smallest fix scope before writes.

`env -u NODE_TEST_CONTEXT NODE_ENV=test node /tmp/storage-cors-delete-audit.mjs`: exit1, six passing controls and two contract failures (expected0 rejected calls, actual2), networkAttempts0. Real R2Service/deleteVideoStorage/resolveConnection, actual StorageService.listConnections/isUnlocked, actual SDK wrapper/key collector/deleteObject; remote SDK classes replaced locally, S3Client.send fake, persistence `_getAccount` returns synthetic account record. No real account/credentials/cloud/delete operations. Fixture strings are invented, example.invalid URLs.

Controls: owned media+(.torrent)+thumbnail3 requests/deleted3; external host+base-prefix sibling0 clients/deletes; locked-owned skip storage-locked; locked-external skip no-matching-objects; partial transport failure2success/1failed/3requests/no rejection; valid cached locked connection resolves storage-locked.

Failure: synthetic cached R2 metadata retains numeric bucket17 or object publicBaseUrl through real resolveConnection mapping. deleteVideoStorage then calls `.trim()` outside catches and rejects TypeError in2/2 malformed cases,0clients/0deleteIO. SDK was successfully loaded in the same process; success control proves the transport is usable. This is a never-throw contract violation, not a demonstrated blocked note deletion: app.handleDeleteModalConfirm and editModalController already catch cleanup exceptions. The malformed locked connection can fail before returning a storage-locked summary/warning.

Proposed route: defensively validate primitive string fields in R2Service.deleteVideoStorage and return structured skip without interpreting malformed object metadata as permission/bucket names; add focused real-wrapper transport regression + integrity/mutants. s3UploadService has no deleteVideoStorage implementation; mirrored upload/key code remains unchanged. Await dispatch scope/semantics before product or committed test edits.

Existing evidence scope: tests/services/r2-delete-video-storage.test.mjs covers five service scenarios with overridden client/delete I/O; tests/delete-storage-locked.test.mjs covers three locked/generic controls. Neither covers malformed persistent metadata. Existing helpers implement owner-base prefix exclusion. Full delete caller passes only targetVideo, so historical all-version object enumeration remains followup. Current edit caller DOES compare changed nonempty thumbnails and queues old thumbnail cleanup; dated TODO “thumbnail cleanup skipped” is stale for this path. No new retention/deletion semantics proposed.

Deferred feed3: /tmp/storage-cors-feed-audit.mjs preserved; attempted real client/buffer/service/engine/coordinator/view scratch failed its initial visible-seed control0/2; no deletion finding or full feed proof. No product/test edit made from that invalid fixture.

No browser/build/full gate used. No tool/gate wait blocking read-only work; actual cloud/provider IAM/serialization and real malformed user records unverified. No production data or signer used.

Routed15:06:18UTC after independent dispatch confirmation. Implemented bounded metadata guard and13 retained real-service scenarios; original method fails9/13;7 restored mutants rejected. Focused4files/24scenarios,lint11/build pass. See storage-cors-delete-integrity.md. Awaiting full/submit slot requested15:08:52UTC. Current HEAD/baseac99ae9a;service unchanged from filedAt before fix,claim2 now visible/in-progress. No upload-copy deletion counterpart exists; no unrelated copy edits.
