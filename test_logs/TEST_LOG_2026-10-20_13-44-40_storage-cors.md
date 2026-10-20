# storage-cors-1 merged-tree verification
- Product commit:2fb6a536568eeb5b4cc04257255f98cde34b7f66.
- Required merge:0919be930c1c8cc8e26685381b3763b660f741ed (git merge unstable; sandbox EROFS required authorized permission retry). Incoming changes administrative only.
- `env -u NODE_TEST_CONTEXT node scripts/run-unit-tests.mjs storage-cors-preservation storage-cache-control multipart-empty-file-guard`: exit0,3/3 files,13 scenarios.
- `env -u NODE_TEST_CONTEXT npm run lint`: exit0,11 checks; same sandbox permission for read-only git subprocess.
- `env -u NODE_TEST_CONTEXT npm run build`: exit0 incl deployment-artifact verifier.
- Full/submit reserved after client; no explicit grant as of13:44:33UTC. No browser/cloud or concurrent-writer qualification. No landing claim.
