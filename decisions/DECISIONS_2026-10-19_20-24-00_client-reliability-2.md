# client-reliability-2: hermetic concurrent init

- NIP01 REQ/CLOSE and docs/architecture-refactor.md L1 contract require callers to close subscriptions. Retain real init/L1/feed behavior; fake only IO boundaries.
- Root cause: original client.connectToRelays stub returned [], explicitly signaling initial connection failure. init schedules ConnectionManager's timer, whose callback calls manager.connectToRelays (not the client stub). That path attempts configured public relays and retains retries. Original subscription was also never unsubscribed.
- Replace 50ms mock sleep with deferred entry/release barriers. Successful manager-level connection fixture prevents retries without disabling product retry logic. Pin timer absence with assertion; teardown resets as failure-path hygiene, not a success substitute.
- Add stricter outcomes: pending second caller, observed pool feed filter, nonempty relays, and exactly-once transport closure. Preserve all original expectations and await both callers.
- Mutate via test-local IO/init overrides only; product Nostr/shared helpers/global runner remain untouched. Both early-return and failure-connection variants fail naturally.
- Prior profile-modal commits preserved separately. No actual signer/wallet/relay/browser/build/deploy qualification. Normal full gates required before either item lands.
