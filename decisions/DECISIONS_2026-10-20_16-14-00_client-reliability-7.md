# Item7 notification ownership

- Live updates notify the same full ordered cached list emitted/persisted already,including deletion-only empty results. Preserve event payload/deleted metadata and filtering.
- A service-owned notification object carries latest loadVideos consumer across reused subscription. Creating replacement subscription uses fresh identity;clear invalidates before unsub. Old subscription callback cannot change cache,notify consumer,emit or persist after disposal.
- Interpreter independently identified stale captured consumer;our A→B and force/clear tests fail firstcallbackpatch,pass revisedtoken. Service lifecycle state explicitly routed by dispatch16:10:24.
- Keep existing cache/persistent callbacks and callback-throw isolation. Event-only consumers remain supported. No productpolicy change/forced UI refresh. Browser qualification belongs to QA.
