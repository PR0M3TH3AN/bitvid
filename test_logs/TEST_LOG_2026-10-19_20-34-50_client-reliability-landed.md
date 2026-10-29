# client-reliability-1 and client-reliability-2 landed

- Code/test tip181eae95: isolated profile27/27, race1/1, lint11/11 and full425/425 files exit0 with60s/file diagnostic bound. All four deliberately broken variants fail and are reverted. See TEST_LOG_2026-10-19_20-35-00_client-reliability-both.md.
- Submitted evidence tip683cedf0bf8ad7c599dacf9d448cecb93ca84ce4 through normal landq.
- Durable land_status reports landed at2026-10-19T20:34:46.018Z, mainSHA de6918cee8c772137d5f05ff34cc9f70685f9f81.
- Normal configured install+full npm test gate exited0 (landq.log). No gate changes or bootstrap exception used.
- `git log -1 unstable`: de6918ce land: area/client-reliability683cedf0bf. `git merge-base --is-ancestor 683cedf0bf8ad7c599dacf9d448cecb93ca84ce4 unstable`: exit0.
- Both backlog items closed only after those checks. Closure metadata follows as a separate normal queue submission.
- Not verified: browser/build/application CSS/layout, real signer/wallet/network/production/deploy. All shipped changes are test harness or notes; no product source changed.
