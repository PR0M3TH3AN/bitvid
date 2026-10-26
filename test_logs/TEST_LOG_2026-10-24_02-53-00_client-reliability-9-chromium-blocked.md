# Client9 Chromium invocation blocked before launch

- Dispatch fresh exclusive grant at 02:52:46Z; two dispatch cooling snapshots reported 74.8C then69.1C/42s. Local fresh health02:52:57Z CPU68.1C/package67C/load2.50/RAM63.6%, swap82% advisory. START announced.
- Command: `env -u NODE_TEST_CONTEXT -u UNIT_TEST_SHARD node /tmp/client9-hls-native-smoke-prepared.mjs chromium > /tmp/client9-hls-chromium-20261024T0253.log 2>&1`.
- Exact reviewed fixture SHA256 `28cf3511c0ac154e59ac519c0f68dfe4099cb37e016bae31c3564ed58db9375e`, dist `c95abe22`, HEAD `7b667e79`.
- Natural exit1 in0.27s: `Error: listen EPERM: operation not permitted 127.0.0.1`, before browser launch. This is a sandbox loopback restriction; no browser assertion or method timeline reached.
- No retry, escalation, Firefox, full suite, build or product change. Slot immediately RELEASED to dispatch; `.task` records blocker. Earlier Chromium replacement timeout evidence preserved unchanged.
- HLS browser qualification remains open; no real decoding/playback/segments/public IO/torrent/RangeGET/Stage3 qualification.
