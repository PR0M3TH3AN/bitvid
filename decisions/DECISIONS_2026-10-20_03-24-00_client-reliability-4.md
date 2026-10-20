# client-reliability-4 implementation

- Existing observer unregister boundary owns per-badge lifecycle tokens, read by controller via WeakMap. Existing app/feed callback arguments unchanged; direct legacy controller consumers remain live until settlement.
- Module-scoped promise→ownership WeakMap mirrors shared real inflight cache across controllers. Last-owner release only cancels queued media jobs. Already-running media/cache behavior remains; no active HEAD/media/HLS/torrent abort.
- Queue resumes reserve a slot synchronously to preserve three-media cap. Cancellation settles with an explicit internal outcome propagated through mirrors and omitted from health cache. Existing state-cache promise identity guard preserves immediate re-request.
- Guards bind UI/RAF work to captured registration; late observer callbacks/eager microtasks and stale disposer cannot affect reused registrations.
- No app/shared observer/cache-module or policy/TTL edits. Scope/read-only predecessor evidence at77d486fb; dispatch implementation routing merged before code.
