# Deployment Notes

## Design system rollout

- **Status:** The design system styling is always active. The former `FEATURE_DESIGN_SYSTEM` runtime flag has been removed, so there is no rollback toggle during deployment.
- **Template contract:** Every layout, view, and partial must keep `data-ds` on its root element. The entrypoint stamps `data-ds="new"` during bootstrap so controllers inherit the correct primitives.
- **Controllers:** UI controllers still receive a `designSystem` context, but `context.isNew()` now always returns `true`. Use the context for consistency, but do not branch on legacy styling paths.

## Asset freshness and cache invalidation

- Static CSS/JS asset freshness is now driven by build-time manifest rewriting (`dist/asset-manifest.json`) instead of runtime `ASSET_VERSION` query-string mutation.
- Keep source HTML entry points (`index.html`, `embed.html`) pointing at logical asset paths (for example, `js/index.js` and `css/tailwind.generated.css`). The build pipeline rewrites those references to content-hashed filenames in `dist/`.
- App routing query parameters (such as `?v=` for video pointers) are unchanged and remain part of runtime URL behavior.
