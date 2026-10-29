# Active HEAD owner cancellation

Source: docs/performance-efficiency-plan.md Stage3, campaign2026-10-22 priority2, fleet/RULE-CHANGES.md2026-10-22 and explicit dispatch routing56417d11 durably landed e04549f8.

Old scoped behavior: queued work and active media cancel on final-owner disposal, but active HEAD fetch remains until response/error/timeout. A fresh observer may join that obsolete inflight record. Controlled11-mode reproduction independently confirmed3 failures/8 controls.

New contract: final registered owner loss invalidates active HEAD synchronously, requests transport abort when supported and promptly settles the observer chain null independently of transport cooperation. HEAD timer and cancellation hook are released. Same-turn/later consumers start fresh work; obsolete response/error/timer/finalizer cannot affect replacement, cache, badges, media or mirrors. Unsupported AbortController still permits logical settlement and cleanup, but cannot promise transport abort.

Preserve shared and cross-controller ownership, legacy consumers, live HEAD success/error/timeout/opaque/bad-status media fallback and cache, media-hook handoff and FIFO/cap. Existing29 media lifecycle scenarios and4+4 adjacent controller/multisource scenarios remain unchanged. No retained assertion was relaxed or removed;23 new HEAD scenarios tighten previously uncovered behavior. This is a scope extension, not retroactive proof of HEAD cancellation by item8.

Only js/ui/urlHealthController.js HEAD phase changes. Observer, cache, app, HLS, torrent, RangeGET and limits/TTLs unchanged. HLS/torrent remain separately open. No browser/real network bytes/fullStage3 qualification.
