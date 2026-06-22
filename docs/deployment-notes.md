# Deployment Notes

## Design system rollout

- **Status:** The design system styling is always active. The former `FEATURE_DESIGN_SYSTEM` runtime flag has been removed, so there is no rollback toggle during deployment.
- **Template contract:** Every layout, view, and partial must keep `data-ds` on its root element. The entrypoint stamps `data-ds="new"` during bootstrap so controllers inherit the correct primitives.
- **Controllers:** UI controllers still receive a `designSystem` context, but `context.isNew()` now always returns `true`. Use the context for consistency, but do not branch on legacy styling paths.

## Asset freshness and cache invalidation

- Static CSS/JS asset freshness is now driven by build-time manifest rewriting (`dist/asset-manifest.json`) instead of runtime `ASSET_VERSION` query-string mutation.
- Keep source HTML entry points (`index.html`, `embed.html`) pointing at logical asset paths (for example, `js/index.js` and `css/tailwind.generated.css`). The build pipeline rewrites those references to content-hashed filenames in `dist/`.
- Deploy pipelines should always purge HTML entrypoints (`/` + `/index.html` and `/embed.html`) at the edge after publish so clients do not keep serving stale source shells.
- App routing query parameters (such as `?v=` for video pointers) are unchanged and remain part of runtime URL behavior.

## Release channels → Vercel projects (promotion + on-demand deploy)

The three release branches each map to a **separate Vercel project** under the
`pr0m3th3ans-projects` team:

| Branch     | Vercel project    | Live URL                  |
|------------|-------------------|---------------------------|
| `unstable` | `bitvid-unstable` | `unstable.bitvid.network` |
| `beta`     | `bitvid-beta`     | `bitvid-beta.vercel.app`  |
| `main`     | `bitvid`          | `bitvid.network` (prod)   |

The repo's local `.vercel/project.json` is normally linked to **`bitvid-unstable`**
so day-to-day `vercel deploy --prod` targets the unstable site.

### vercel.json knobs
- `installCommand: "npm install"` is pinned because both `package-lock.json` and
  `pnpm-lock.yaml` exist; without the pin Vercel auto-selects pnpm and the build
  fails on the unstable/beta projects.
- `git.deploymentEnabled.unstable: false` disables auto-deploy for a branch named
  `unstable`. It only affects that branch key, so it's harmless on the beta/main
  projects (they deploy `beta`/`main`). The bitvid-beta/bitvid projects ARE
  git-connected, so a push to `beta`/`main` also auto-triggers a build — explicit
  CLI deploys (below) just make the result deterministic.

### Promotion (unstable → beta → main)
`unstable` is the integration branch. `main` is usually a clean ancestor
(fast-forward). `beta` can carry an extra superseded commit (e.g. an old
`vercel.json` pin), so prefer a merge that takes unstable's tree:

```bash
# beta: merge unstable, preferring unstable on conflict; verify trees match
git checkout beta && git reset --hard origin/beta
git merge origin/unstable -X theirs --no-edit -m "Promote unstable → beta: <summary>"
git diff --quiet origin/unstable HEAD && echo "beta tree == unstable"   # expect 0
git push origin beta

# main: fast-forward to unstable
git checkout main && git reset --hard origin/main
git merge --ff-only origin/unstable
git push origin main
```

### Build/deploy each project (on-demand)
```bash
# beta
vercel link --yes --project bitvid-beta && vercel deploy --prod --yes
# production
vercel link --yes --project bitvid && vercel deploy --prod --yes   # aliases to bitvid.network
# restore the day-to-day link
vercel link --yes --project bitvid-unstable
```

### Verify
The footer version marker (`v: <8hex> • <date>`) is content-hash based; all three
projects build from the same source in the same Vercel env, so the markers should
**match each other** after a promotion. Verify per domain and confirm a known new
module is served, e.g.:

```bash
for host in unstable.bitvid.network bitvid-beta.vercel.app bitvid.network; do
  echo -n "$host : "; curl -s "https://$host/index.html?cb=$(date +%s)" \
    | grep -oE 'v: [0-9a-f]{8} • [0-9-]+' | head -1
done
```

> Caveat: promoting a large batch straight to `main` skips the `beta` soak. Do it
> only deliberately; otherwise let changes soak on `beta` first. Rollback = redeploy
> the previous `bitvid` production deployment (`vercel rollback` or redeploy by URL).
