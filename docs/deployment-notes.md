# Deployment Notes

## FEATURE_DESIGN_SYSTEM rollout

- **Default:** `true` (design system styling). The flag lives in `js/constants.js` and is exposed through `window.__BITVID_RUNTIME_FLAGS__` at runtime.
- **Enable for canaries:** No action required—the new primitives ship enabled by default.
- **Disable / rollback:** Set the flag to `false` via the runtime object or redeploy with an override. All root containers revert to `data-ds="new"`, forcing controllers and templates to stay on the existing class list.
- **Template contract:** Every layout, view, and partial now includes `data-ds` on the root element. Keep this attribute intact when editing HTML so the runtime can swap modes without re-rendering.
- **Controllers:** UI controllers receive a `designSystem` context in their constructors. Call `context.isNew()` before attaching new components or classes, and lean on `context.getMode()` when logging or telemetry need to differentiate between legacy and new renders.
