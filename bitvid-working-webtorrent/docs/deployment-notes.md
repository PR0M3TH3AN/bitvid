# Deployment Notes

## Design system rollout

- **Status:** The design system styling is always active. The former `FEATURE_DESIGN_SYSTEM` runtime flag has been removed, so there is no rollback toggle during deployment.
- **Template contract:** Every layout, view, and partial must keep `data-ds` on its root element. The entrypoint stamps `data-ds="new"` during bootstrap so controllers inherit the correct primitives.
- **Controllers:** UI controllers still receive a `designSystem` context, but `context.isNew()` now always returns `true`. Use the context for consistency, but do not branch on legacy styling paths.
