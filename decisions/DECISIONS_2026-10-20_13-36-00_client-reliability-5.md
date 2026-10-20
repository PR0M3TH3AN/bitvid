# Item5 continuation boundary

- Keep bounded already-active success/failure caching. Check existing lifecycle owners only BEFORE starting each candidate in probeUrlList; zero owners marks existing record cancelled and returns explicit cancellation. No probe abort or observer/cache/TTL/concurrency change.
- Shared and rejoining owners remain eligible because record owners are checked at continuation time. Completed final-source failure keeps original cache behavior; cancelled mirror chains never cache offline.
- Six focused regressions exercise actual observer/controller/cache plus external IO twins; unique integrity file during parallel trial.
- Dispatch resource coordination: local full suite is next after administrative drain but requires explicit grant; browser belongs initially to playback QA. All CLI/gate launches clear inherited NODE_TEST_CONTEXT operationally; no kit/runner change.
