# Major Dependency Upgrades Needed

The following dependencies have major version upgrades available. These require manual review and potentially migration guides.

## Packages

### tailwindcss
- **Current:** `3.4.19`
- **Latest:** `4.1.18`
- **Notes:** Tailwind v4 is a significant rewrite. Breaking changes expected in configuration and build process.

### stylelint
- **Current:** `16.26.1`
- **Latest:** `17.1.0`
- **Notes:** Check for deprecated rules and config format changes.

### pixelmatch
- **Current:** `5.3.0`
- **Latest:** `7.1.0`
- **Notes:** Used in visual tests. Verify image comparison logic remains compatible.

### esbuild
- **Current:** `0.25.12`
- **Latest:** `0.27.2`
- **Notes:** Check build scripts (`scripts/build-beacon.mjs`) for compatibility.

### prettier-plugin-tailwindcss
- **Current:** `0.6.14`
- **Latest:** `0.7.2`
- **Notes:** Minor version bump but 0.x semantic.

## Action Items
- [ ] Create individual tasks for each major upgrade.
- [ ] Review migration guides for each package.
- [ ] Create branches for each upgrade to isolate regressions.
