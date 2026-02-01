# Automated PR Review Report

## 1. PR: codex/add-centralized-permission-gate
**Target:** `main`
**Status:** ❌ Request Changes

### ❌ Test Failures
`tests/nostr-login-permissions.test.mjs` failed (6 subtests).
> **Suggestion:** Inspect `tests/nostr-login-permissions.test.mjs`. It seems related to `extension.enable` assertions. Run `npm run test:unit` locally.

### 🚀 Release Channel Checks
⚠️ **Warning:** Targets `main` but modifies critical config (`config/instance-config.js`, `js/constants.js`).
> **Guidance:** Ensure feature flags are safe defaults.

### 🛡️ Guardrails
`requires-security-review` `requires-protocol-review`
- Touched 41 sensitive files including `js/auth/signingAdapter.js`, `js/dmDecryptor.js`, `js/nostr/nip07Permissions.js`.

---

## 2. PR: codex/remove-nip04-and-nip44-from-default-permissions
**Target:** `main`
**Status:** ❌ Request Changes

### ❌ Test Failures
`tests/nostr-login-permissions.test.mjs` failed (6 subtests).
> **Suggestion:** Same failure as above. Likely an environmental issue or regression in NIP-07 logic.

### 🚀 Release Channel Checks
⚠️ **Warning:** Targets `main` but modifies critical config.

### 🛡️ Guardrails
`requires-security-review` `requires-protocol-review`
- Touched 41 sensitive files.

---

## 3. PR: fix/optimize-nip07-login-perf-4235940878368250470
**Target:** `main`
**Status:** ❌ Failure / Timeout

### ❌ Test Failures
Tests timed out during execution.
> **Suggestion:** Run `npm run test:unit:shard1` locally to verify changes without timeout.

---

## Audit Log
| Branch | Lint | Format | Tests | Security |
| :--- | :--- | :--- | :--- | :--- |
| `codex/add-centralized-permission-gate` | ✅ Pass | ✅ Pass | ❌ Fail | 🛡️ Req |
| `codex/remove-nip04-and-nip44...` | ✅ Pass | ✅ Pass | ❌ Fail | 🛡️ Req |
| `fix/optimize-nip07-login-perf...` | ✅ Pass | ✅ Pass | ❌ Timeout | ? |

**Micro-fixes:** No formatting changes detected in the reviewed branches.
