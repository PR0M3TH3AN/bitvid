# Decisions

- **Refactor `5000` in UI controllers to `SHORT_TIMEOUT_MS`**:
  - **Context**: Used in `setTimeout` for clearing status messages.
  - **Decision**: Use `SHORT_TIMEOUT_MS` from `js/constants.js` which is already defined as 5000.
  - **Rationale**: Increases consistency and makes the timeout configurable from a central location if needed.

- **Refactor `60000` in `js/webtorrent.js` to `LONG_TIMEOUT_MS`**:
  - **Context**: Used as `TIMEOUT_DURATION` for service worker operations.
  - **Decision**: Use `LONG_TIMEOUT_MS` from `js/constants.js` which is already defined as 60000.
  - **Rationale**: Aligns with the project's standard long timeout constant.
