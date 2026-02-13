# Decisions

- **File:** `js/subscriptions.js`
- **Migration:** Replaced `innerHTML` assignments with `replaceChildren()` and `document.createElement()`.
- **Helpers:** Added `_renderStatusMessage` and `_renderLoading` to `SubscriptionsManager` to encapsulate DOM creation for status and loading states.
- **Dependency:** Removed dependency on `getSidebarLoadingMarkup` (which returned a string) in this file, preferring local DOM creation.
- **Baseline:** Updated baseline for `js/subscriptions.js` from 7 to 0.
