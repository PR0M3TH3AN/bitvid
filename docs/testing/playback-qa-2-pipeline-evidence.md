# QA2 measured pipeline boundary: ingested3, rendered0

Diagnostic authorized by dispatch15:58:27 and interpreter15:59:09;START16:00:28 before browser/server launch.
Actual run16:00:32.126→16:00:50.999Z(18.873s),Chromium154.0.8037.97,360×800.
Unchanged original3 seeded notes(no s tag),genuine media overlay,real Buffer mirror,immutable822 built app;
no refresh/card injection/cache edit/crypto stub/product change or assertion relaxation.

**First evidenced gap is after ingestion/app map and before DOM cards.** Actual local WS connected and sent a
video REQ kinds30078/#tvideo/limit200. Received3 distinct EVENT ids and EOSE for that subscription.
Client rawEvents/allEvents/activeMap all3;app.videosMap3;initialized true,pool one relay,app service shares same client.
Actual DOM has0 data-testid=video-card and0 data-video-id. Styled Trending view displays no public videos.
No navigation/login/modal/390/1280/UI assertions executed;baseline remains incomplete. This is not yet a product-defect
attribution:filtering/visibility/render decisions have not been measured. Configured relay health alone is no longer
the only evidence;the actual wire delivery and ingest counts were observed passively.

Missing s tag causes actual schema validation failure but did NOT prevent delivery/ingestion of these3 notes;
actual converter accepted them. Do not fix that gap blindly and claim it explains this render boundary.
It remains a known difference from the canonical existing fixture to disclose in any later baseline.
Earlier mode-filter speculation is unsupported and withdrawn. Startup-ready correction also did not move0/3.

Genuine HTTP fixture checks passed HEAD200/GET2001019bytes/Range206;real canonical toolkit/signature/tamper proofs passed.
Buffer fulfilled locally once;all other non-local HTTP attempts blocked10,non-localWS0,local404=0,pageerrors0.
Only browser warning:service worker blocked intentionally by the harness context. Guards do not fake media events/health.
All owned browser/app/relay servers closed16:00:50.999Z;explicit RELEASE16:01:25Z. Preview3000 untouched.
No further browser or fix was started from this result. Next routing must measure actual filtering/render boundary,
not reduce the3-card requirement,change toolkit/crypto logic,or turn this into a boot-only success.

[Actual empty styled Trending screenshot](playback-qa-2-pipeline-diagnostic.png)

Reproduction uses own scratch diagnostic.mjs(versionSHA2563b758e6695eecb438f53344512fed186f4d1c459ca70ba49722a0177afcf39f5),
node execution against the documented frozen artifact/genuine media/real existing mock relay with external deny guard.
It attaches only passive page WebSocket/frame and console listeners,then reads cache/DOM counts after the unchanged
3-card15s wait. Full filters for unrelated built-in admin-list subscriptions are omitted below;they contain no video
seed response and do not alter the identified video path. Exact raw trace remains in own scratch pipeline-result.json.

```json
{
  "started": "2026-10-20T16:00:32.126Z",
  "ended": "2026-10-20T16:00:50.999Z",
  "browser": "154.0.8037.97",
  "localWsRouteHits": [
    "ws://127.0.0.1:31848/"
  ],
  "frameCounts": {
    "sent:REQ": 15,
    "received:EOSE": 15,
    "sent:CLOSE": 12,
    "received:EVENT": 3
  },
  "videoSubscriptionTraffic": [
    {
      "at": "2026-10-20T16:00:35.756Z",
      "direction": "sent",
      "url": "ws://127.0.0.1:31848/",
      "type": "REQ",
      "subId": "sub:13",
      "filters": [
        {
          "#t": [
            "video"
          ],
          "kinds": [
            30078
          ],
          "limit": 200
        }
      ]
    },
    {
      "at": "2026-10-20T16:00:35.764Z",
      "direction": "received",
      "url": "ws://127.0.0.1:31848/",
      "type": "EVENT",
      "subId": "sub:13",
      "eventId": "e5464da7e3278076a0d3030ee3b9f233495d98b3159ec4e801b7651076b41c21",
      "kind": 30078
    },
    {
      "at": "2026-10-20T16:00:35.765Z",
      "direction": "received",
      "url": "ws://127.0.0.1:31848/",
      "type": "EVENT",
      "subId": "sub:13",
      "eventId": "696fe1a6e5cfe784dc4a883f6c32cc9c3a15f9770a9403e0600d57cfe69d705a",
      "kind": 30078
    },
    {
      "at": "2026-10-20T16:00:35.765Z",
      "direction": "received",
      "url": "ws://127.0.0.1:31848/",
      "type": "EVENT",
      "subId": "sub:13",
      "eventId": "e48da2722113d312388399e7af346bcf1e8fd0edad2b7e8446e0e379e645d28b",
      "kind": 30078
    },
    {
      "at": "2026-10-20T16:00:35.765Z",
      "direction": "received",
      "url": "ws://127.0.0.1:31848/",
      "type": "EOSE",
      "subId": "sub:13"
    }
  ],
  "failureDiagnostics": {
    "appPresent": true,
    "relayHealth": {
      "relays": [
        "ws://127.0.0.1:31848"
      ],
      "unreachable": [],
      "backoff": {}
    },
    "feedItems": [],
    "rawEvents": 3,
    "allEvents": 3,
    "activeMap": 3,
    "appVideoMap": 3,
    "clientInitialized": true,
    "poolExists": true,
    "poolRelayCount": 1,
    "subscriptionManagerKeys": [
      "subscribe",
      "list",
      "handleReconnect",
      "closeAll",
      "getActiveKeys"
    ],
    "appServiceClientMatches": true,
    "domCardTestids": 0,
    "domVideoIds": 0,
    "body": "Switch to dark theme\nTrending\n\nNo public videos available yet. Be the first to upload one!\n\nseed. zap. subscribe.\nv: 1834b6a9 \u2022 2026-10-20"
  },
  "consoleWarnings": [
    "Service Worker registration blocked by Playwright"
  ],
  "fixtureHttp": {
    "head": 200,
    "get": 200,
    "range": 206,
    "bytes": 1019,
    "contentType": "video/webm"
  },
  "bufferMirrorHits": 1,
  "otherNonlocalHttpBlocked": 10,
  "nonlocalWsBlocked": 0,
  "local404": 0,
  "pageErrors": [],
  "resourcesClosed": true
}
```

Runtime snapshot manifest remains662fa755e3cde021058f5bf9a5bd2825698bad064ab80472a5ba70e651d764b1;
build1834b6a9/index5095c3f1326b035ef93267ad77663ea641edb1acaae6d18e88085eff08c5d6d3.
No full suite/build/native Firefox/production/live-peer/cloud/signer qualification is implied.
