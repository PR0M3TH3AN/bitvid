# Client9 normal-gate thermal interruption

- Committed candidate/submission `c20635bc8539328ca1677f3cf63cbe870adeb9c2`; product1b2362d2/merge1bf50c1f, normal queue START19:12:41. No runner/gate/assertion changes or separate full run.
- Required full lint11/11 passed via approved host route; original sandbox hex spawnSync git EPERM retained. See lint-stage log.
- Health sequence during gate:19:13:35 max87.1C;19:13:51 max87.1C;19:14:05 max83.8C;19:14:40 max90.1C/load12.77;19:15:18 max86C/load13.5. Final two hot samples span38s; thermal threshold85C sustained. No claim heat is caused exclusively by this job or other apps.
- Host inspection verified gate process group204078, parentlander204041, cwd bitvid-lander and timeout1800s. Approved SIGINT only that group19:15:32. No unrelated process stopped. This is an interrupted run, not a natural full pass or a product assertion failure.
- Durable `land_status c20635bc`: rejected/red, unchanged normal gate exit1 at19:15:32.782; lander false. `git rev-parse HEAD unstable`: c20635bc /04c8c7cf61eed29424f561297ef49c6cdfa91a0a. Not landed; no ancestry-success claim.
- Independent runner-equivalent discovery438; partial starts275/unique275/unexpected0, last tests/settings-restore-prompt.test.mjs,163neverstarted. Last started file has no completion evidence. No actual not-ok or nonzero fail/cancelled lines in preserved partial log; not an all-suite result.
- Complete partial log/result copied before any next run to state/evidence/client9-torrent-validation-20261026/test_unit-interrupted-1915.log and result-c20635bc-interrupted-1915.json, hashed in manifest-1915.sha256. Both lint logs also retained there.
- RELEASE and material hold delivered dispatch19:15:58. New explicit hold: dispatch fresh thermal/resource clearance and renewed exclusive slot; NO automatic resubmission. Next light work evidence/discovery review; source unchanged. No build/browser grant, real transport/peer/playback/CPU/wholeStage3 qualification.
