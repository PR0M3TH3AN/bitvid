# Item6 test design

- Use actual profile config/factory and DOM click with original renderer removal/controller/local service. Observe actual removal promise only for deterministic completion. Required unrelated constructor services and read/metadata boundary are controlled; no fake renderer/remove implementation.
- Local and synced removal include final-item case and renderer recreation; local Clear is a separate scenario with real queue reset. No synced Clear assumption.
- Synced IO twin respects replace vs merge, so missing replace is observable rather than rubber-stamped. Assert all published payload/options plus publication occurrence, without requiring duplicate implementation calls.
- Isolated runtime mutants exercise historical config no-op,clear no-op,drop-replace,wrong actor and final-item no-op. Explicit teardown runs on assertion failure and restores queue/app/client/globals.
- No product/existing suite edits; focused/lint only until dispatch allocates full/normal slot. Build/browser remain unverified/outside current grant for test-only retention.
