# Dispatch item4 verification

- Product89ccb907 via durable7055496b; closuref116f7c8 via durable94676453; git log unstable confirmed closure. Product ancestry exit0.
- Initial node --test inherited NODE_TEST_CONTEXT and skipped; not counted. env -u NODE_TEST_CONTEXT node --test three files returned3 file exits0; then direct file runs to ensure scenario counts:
- env -u NODE_TEST_CONTEXT node tests/url-health-lifecycle.test.mjs:12/12 exit0 naturally.
- env -u NODE_TEST_CONTEXT node tests/url-health-multisource.test.mjs:4/4 exit0.
- env -u NODE_TEST_CONTEXT node tests/ui/url-health-controller.test.mjs:4/4 exit0.
- npm run build including artifact verification:exit0. Existing preview kept. Sandbox curl000; host localhost curl --fail http://127.0.0.1:3000 returned200 exit0; cmp dist/index.html downloaded preview index exit0.
- Worker-derived evidence427/427 full files,22 focused,13 mutants,lint11/11,controlled native Chromium+Firefox smoke; not rerun independently.
- Unverified active abort/native decoding/real playback fallback/live peers/CPU-RSS/full Stage3. No new item assigned.
