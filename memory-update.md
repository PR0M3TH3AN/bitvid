# Memory Update — const-refactor-agent — 2026-02-28

## Key findings
- Extracted `30000` (max decrypt retry delay) into `MAX_DECRYPT_RETRY_DELAY_MS` in `js/constants.js`.
- Extracted `15000` (decrypt timeout) into `DECRYPT_TIMEOUT_MS` in `js/constants.js`.

## Patterns / reusable knowledge
- Duplicated numeric constants across domains (like userBlocks, subscriptions, hashtagPreferencesService) belong in `js/constants.js` when they represent similar constraints (like NIP-04/NIP-44 operations).
