# Context

**Goal:** Execute the `bitvid-decompose-agent` task (daily scheduler).
**Scope:** Decompose `js/ui/profileModalController.js` by extracting hashtag preference logic into `js/ui/profileModal/ProfileHashtagController.js`.
**Focus:** Reduce file size by moving cohesive hashtag-related methods and state.

**Definition of Done:**
- [ ] Create `js/ui/profileModal/ProfileHashtagController.js`.
- [ ] Move methods: `normalizeHashtagTag`, `formatHashtagTag`, `getResolvedHashtagPreferences`, `setHashtagStatus`, `refreshHashtagBackgroundStatus`, `populateHashtagPreferences`, `renderHashtagList`, `sanitizeHashtagList`, `createHashtagListItem`, `persistHashtagPreferences`, `handleAddHashtagPreference`, `handleRemoveHashtagPreference`, `handleHashtagPreferencesChange`, `describeHashtagPreferencesError`.
- [ ] Integrate into `js/ui/profileModalController.js`.
- [ ] Verify changes with `npm run lint` and `npm run test:unit`.
- [ ] Update `scripts/check-file-size.mjs` baseline.
- [ ] Update `docs/agents/AGENT_TASK_LOG.csv`.
