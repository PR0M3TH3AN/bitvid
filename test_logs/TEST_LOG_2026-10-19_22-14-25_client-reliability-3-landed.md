# client-reliability-3 normal landing

- Code607d5ce1a1265d6586eac8428004e6a891201061; submitted evidence tip e522efc191956c90d207cbf1329f355aa9372531.
- Durable land_status reports landed at2026-10-19T22:14:20.619Z, mainSHA7d20a509cad153f894d887429740bf0152166a68.
- Normal configured install+npm test gate exited0 (landq.log); no gate/kit changes or exception. `git log -1 unstable` prints7d20a509; `git merge-base --is-ancestor e522efc191956c90d207cbf1329f355aa9372531 unstable` exits0.
- Local exact checks:426/426 unit files exit0 with60s/file bound; focused27/27 across4 files (11 lifecycle,6 priority,9 visibility,1 observer);14 rejected/reverted mutants; lint11/11; build/artifact verification and both native Chromium/Firefox controlled-IO lifecycle smokes pass. See22-08-15 final log and TEST_INTEGRITY.md.
- Dispatch landing evidence delivered by file mailbox after verification. Delivery does not wake idle dispatch. Dispatch owns preview sync/rebuild; owner port3000 preserved. No scheduler/kit changes.
- Item closed after durable landing/ancestry. Closure metadata follows through normal queue rules. No further work without routing.
- Not qualified: actual media playback fallback/live torrent peers, active abort/URL cancellation, CPU/RSS, full Stage3, wallets/signers/production/deploy.
