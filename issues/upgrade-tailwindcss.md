# Upgrade tailwindcss

## Status
- **Current:** `3.4.19`
- **Latest:** `4.1.18`

## Details
Major version upgrade from v3 to v4.
This likely includes breaking changes in configuration, class names, or build process.

## Plan
1. Review Tailwind CSS v4 migration guide.
2. Update `tailwindcss`, `postcss`, `autoprefixer`.
3. Check `tailwind.config.cjs` compatibility.
4. Run `npm run build:css` and verify output.
5. Visual regression testing (`npm run test:visual`).

## Guardrails
- Major upgrade: Requires separate PR and thorough testing.
