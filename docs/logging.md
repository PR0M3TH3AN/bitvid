# Logging and Dev-Mode Guidance

This document explains how bitvid routes browser logs, how inline scripts can
re-use the shared logger, and what operators must do with the dev-mode flag when
promoting builds.

## Picking the right channel

bitvid ships a frozen logger at `js/utils/logger.js` with two channels:

- `logger.dev`: Emits only when `IS_DEV_MODE` is truthy. Use this channel for
  verbose traces, performance probes, and feature flag experimentation that
  should disappear from production consoles. The `logger.dev.debug` helper is
  available for especially noisy traces that you want to keep isolated to local
  development sessions.
- `logger.user`: Always available and automatically prefixes output with
  `[bitvid]`. Use this channel for operator-facing warnings and errors that help
  diagnose issues in production.

When adding new messages, classify them by the audience:

| Scenario | Recommended channel | Notes |
| --- | --- | --- |
| Debugging a new feature locally | `logger.dev.debug`/`logger.dev.info` | Remove or downgrade before launching if they no longer serve a purpose. |
| Non-fatal recoverable issues users should investigate | `logger.user.warn` | Provide actionable context so operators know what failed. |
| Fatal errors that block playback or payments | `logger.user.error` | Escalate with a clear message and include relevant IDs or URLs. |
| Metrics or noisy traces that only help during QA | `logger.dev.*` | Wrap expensive logging in conditional checks when possible. |

Avoid direct `console.*` calls—routing everything through the logger keeps the
production console clean and guarantees dev-mode gates behave consistently.

## Using the logger from inline scripts

The logger is exposed as a frozen global so inline scripts can share the same
API without additional bundling:

```js
const { dev, user } = window.bitvidLogger;

dev.log("rendering upload modal preview");
user.warn("Playback manifest missing expected resolution tag");
```

If you need to guard logic by environment, rely on the companion global set in
`js/config.js`:

```js
if (window.__BITVID_DEV_MODE__) {
  window.bitvidLogger.dev.info("Hydrating admin widgets in dev mode");
}
```

The globals are populated as soon as `js/config.js` loads. Check for their
existence before using them in third-party contexts that may execute earlier.

## Adjusting the dev-mode flag for deployments

The source of truth lives in `config/instance-config.js`:

- Set `IS_DEV_MODE = true` while developing locally so the dev logger and other
  diagnostics are available.
- Keep `IS_DEV_MODE = false` for production builds. This value propagates to
  `isDevMode` (the module export), `window.__BITVID_DEV_MODE__`, and
  `logger.dev`, silencing development-only messages.

Always commit the flag change alongside deployment-ready configuration tweaks.
Forgetting to update the flag leaves verbose traces in user consoles and can
expose experimental behavior intended only for QA environments.

If you need to enable dev logging without editing `config/instance-config.js`,
inject a runtime override before `js/config.js` loads:

```html
<script>
  window.__BITVID_DEV_MODE_OVERRIDE__ = true;
  window.__BITVID_VERBOSE_DEV_MODE_OVERRIDE__ = true;
</script>
```

Overrides accept boolean values or the strings `"true"` / `"false"` so they can
be injected by a build pipeline.
