# Active HLS manifest owner cancellation

Source: docs/performance-efficiency-plan.md Stage3, PROGRAM campaign priority2, explicit dispatch mailbox2026-10-22T20:55:13Z and newest RULE-CHANGES HLS routing. Dispatch independently reproduced actual12mode baseline7pass/5fail atd04d501e.

Old scoped behavior: queued/media/HEAD ownership cancellation does not reach the HLS manifest helper. Final-owner disposal retains manifest GET/body-read/timer and unsettled observer work; same-source rejoin inherits the old request and late success can cache.

New HLS health-probe contract: last registered owner disposal synchronously invalidates that work, requests transport abort where available and promptly settles the observer chain null even if fetch/body ignore abort or AbortController is absent. Release manifest timer and only that probe's hook once. Pre-cancelled work starts no GET. Fresh same-turn/later same-source owners start fresh identity; old responses/errors/timers/finalizers cannot change replacement/cache/badges/media/mirrors.

Preserve shared/cross-controller and ownerless legacy consumers, live success/error/bad-body/timeout, existing helper calls without lifecycle, native-HLS preference and existing media/HEAD/FIFO behavior. No existing assertion changed;35 new cases tighten uncovered HLS ownership behavior. This is a scope extension, not retroactive qualification by prior HEAD/media fixes.

Only controller HLS lifecycle argument and manifest-probe optional cancellation plumbing change. HLS engine/player/session/config, app, torrent and RangeGET stay outside this slice. No real playback/network-byte/browser/CPU/wholeStage3 qualification from unit evidence.
