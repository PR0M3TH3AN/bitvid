# Telemetry Report - 2026-01-23

**Total Unique Issues:** 16
**Generated:** 2026-01-23T06:26:53.283Z

## Top 10 Priority Issues

| Priority | Count | Issue | Owner | Sources |
| :--- | :---: | :--- | :--- | :--- |
| **High** | 2 | [batchFetchProfiles] Failed to fetch profiles from relay ... | QA Team | test_unit.log, test_unit_debug.log |
| **High** | 1 | [ChannelProfile] Failed to prepare channel videos for mod... | QA Team | test_unit.log |
| **High** | 1 | [ChannelProfile] Failed to decorate channel video moderat... | QA Team | test_unit.log |
| **High** | 1 | [ChannelProfile] Failed to decorate channel video moderat... | QA Team | test_unit.log |
| **High** | 1 | [ChannelProfile] Failed to decorate channel video moderat... | QA Team | test_unit.log |
| **High** | 1 | [ChannelProfile] Failed to decorate channel video moderat... | QA Team | test_unit.log |
| **High** | 1 | [ChannelProfile] Failed to decorate channel video moderat... | QA Team | test_unit.log |
| **High** | 1 | [ChannelProfile] Failed to decorate channel video moderat... | QA Team | test_unit.log |
| **High** | 1 | [ChannelProfile] Failed to decorate channel video moderat... | QA Team | test_unit.log |
| **High** | 1 | [ChannelProfile] Failed to decorate channel video moderat... | Unassigned | test_unit.log |

## Detailed Breakdown

### [High] [batchFetchProfiles] Failed to fetch profiles from relay wss://fail.example: Error: relay timed out
- **Occurrences:** 2
- **Sources:** test_unit.log, test_unit_debug.log
- **Suggested Owner:** QA Team
- **Fingerprint:** `b6566eea`

**Stack Trace / Details:**
```
[batchFetchProfiles] Failed to fetch profiles from relay wss://fail.example: Error: relay timed out
at Object.list (file://$REPO/tests/app-batch-fetch-profiles.test.mjs:80:31)
at file://$REPO/js/utils/profileBatchFetcher.js:115:10
at Array.map (<anonymous>)
at batchFetchProfilesFromRelays (file://$REPO/js/utils/profileBatchFetcher.js:112:75)
at TestContext.<anonymous> (file://$REPO/tests/app-batch-fetch-profiles.test.mjs:87:11)
at Test.runInAsyncScope (node:async_hooks:214:14)
at Test.run (node:internal/test_runner/test:1047:25)
at Test.start (node:internal/test_runner/test:944:17)
at startSubtestAfterBootstrap (node:internal/test_runner/harness:296:17)
```

### [High] [ChannelProfile] Failed to prepare channel videos for moderation TypeError: Cannot read properties of undefined (reading 'normalizeModerationSettings')
- **Occurrences:** 1
- **Sources:** test_unit.log
- **Suggested Owner:** QA Team
- **Fingerprint:** `c18193e3`

**Stack Trace / Details:**
```
[ChannelProfile] Failed to prepare channel videos for moderation TypeError: Cannot read properties of undefined (reading 'normalizeModerationSettings')
at Application.getActiveModerationThresholds (file://$REPO/js/app.js:6593:56)
at applyChannelModerationToVideos (file://$REPO/js/channelProfile.js:282:21)
at renderChannelVideosFromList (file://$REPO/js/channelProfile.js:4490:28)
at TestContext.<anonymous> (file://$REPO/tests$REPO/channel-profile-moderation.test.mjs:135:26)
at async Test.run (node:internal/test_runner/test:1054:7)
at async startSubtestAfterBootstrap (node:internal/test_runner/harness:296:3)
```

### [High] [ChannelProfile] Failed to decorate channel video moderation TypeError: Cannot read properties of undefined (reading 'decorateVideo')
- **Occurrences:** 1
- **Sources:** test_unit.log
- **Suggested Owner:** QA Team
- **Fingerprint:** `1e73620e`

**Stack Trace / Details:**
```
[ChannelProfile] Failed to decorate channel video moderation TypeError: Cannot read properties of undefined (reading 'decorateVideo')
at Application.decorateVideoModeration (file://$REPO/js/app.js:6598:37)
at decorateChannelVideo (file://$REPO/js/channelProfile.js:210:29)
at applyChannelModerationToVideos (file://$REPO/js/channelProfile.js:363:26)
at async renderChannelVideosFromList (file://$REPO/js/channelProfile.js:4490:22)
at async TestContext.<anonymous> (file://$REPO/tests$REPO/channel-profile-moderation.test.mjs:216:20)
at async Test.run (node:internal/test_runner/test:1054:7)
at async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
```

### [High] [ChannelProfile] Failed to decorate channel video moderation TypeError: Cannot read properties of undefined (reading 'decorateVideo')
- **Occurrences:** 1
- **Sources:** test_unit.log
- **Suggested Owner:** QA Team
- **Fingerprint:** `21dc1236`

**Stack Trace / Details:**
```
[ChannelProfile] Failed to decorate channel video moderation TypeError: Cannot read properties of undefined (reading 'decorateVideo')
at Application.decorateVideoModeration (file://$REPO/js/app.js:6598:37)
at decorateChannelVideo (file://$REPO/js/channelProfile.js:210:29)
at resolveChannelModeration (file://$REPO/js/channelProfile.js:917:23)
at applyChannelVisualBlur (file://$REPO/js/channelProfile.js:962:22)
at updateChannelModerationVisuals (file://$REPO/js/channelProfile.js:1027:18)
at renderChannelVideosFromList (file://$REPO/js/channelProfile.js:4893:3)
at async TestContext.<anonymous> (file://$REPO/tests$REPO/channel-profile-moderation.test.mjs:216:20)
at async Test.run (node:internal/test_runner/test:1054:7)
at async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
```

### [High] [ChannelProfile] Failed to decorate channel video moderation TypeError: Cannot read properties of undefined (reading 'decorateVideo')
- **Occurrences:** 1
- **Sources:** test_unit.log
- **Suggested Owner:** QA Team
- **Fingerprint:** `9cebf1f5`

**Stack Trace / Details:**
```
[ChannelProfile] Failed to decorate channel video moderation TypeError: Cannot read properties of undefined (reading 'decorateVideo')
at Application.decorateVideoModeration (file://$REPO/js/app.js:6598:37)
at decorateChannelVideo (file://$REPO/js/channelProfile.js:210:29)
at applyChannelModerationToVideos (file://$REPO/js/channelProfile.js:363:26)
at async renderChannelVideosFromList (file://$REPO/js/channelProfile.js:4490:22)
at async TestContext.<anonymous> (file://$REPO/tests$REPO/channel-profile-moderation.test.mjs:309:3)
at async Test.run (node:internal/test_runner/test:1054:7)
at async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
```

### [High] [ChannelProfile] Failed to decorate channel video moderation TypeError: Cannot read properties of undefined (reading 'decorateVideo')
- **Occurrences:** 1
- **Sources:** test_unit.log
- **Suggested Owner:** QA Team
- **Fingerprint:** `a8230c7d`

**Stack Trace / Details:**
```
[ChannelProfile] Failed to decorate channel video moderation TypeError: Cannot read properties of undefined (reading 'decorateVideo')
at Application.decorateVideoModeration (file://$REPO/js/app.js:6598:37)
at decorateChannelVideo (file://$REPO/js/channelProfile.js:210:29)
at resolveChannelModeration (file://$REPO/js/channelProfile.js:917:23)
at applyChannelVisualBlur (file://$REPO/js/channelProfile.js:962:22)
at updateChannelModerationVisuals (file://$REPO/js/channelProfile.js:1027:18)
at renderChannelVideosFromList (file://$REPO/js/channelProfile.js:4893:3)
at async TestContext.<anonymous> (file://$REPO/tests$REPO/channel-profile-moderation.test.mjs:309:3)
at async Test.run (node:internal/test_runner/test:1054:7)
at async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
```

### [High] [ChannelProfile] Failed to decorate channel video moderation TypeError: Cannot read properties of undefined (reading 'decorateVideo')
- **Occurrences:** 1
- **Sources:** test_unit.log
- **Suggested Owner:** QA Team
- **Fingerprint:** `07c6b0b2`

**Stack Trace / Details:**
```
[ChannelProfile] Failed to decorate channel video moderation TypeError: Cannot read properties of undefined (reading 'decorateVideo')
at Application.decorateVideoModeration (file://$REPO/js/app.js:6598:37)
at decorateChannelVideo (file://$REPO/js/channelProfile.js:210:29)
at applyChannelModerationToVideos (file://$REPO/js/channelProfile.js:363:26)
at async renderChannelVideosFromList (file://$REPO/js/channelProfile.js:4490:22)
at async TestContext.<anonymous> (file://$REPO/tests$REPO/channel-profile-moderation.test.mjs:383:3)
at async Test.run (node:internal/test_runner/test:1054:7)
at async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
```

### [High] [ChannelProfile] Failed to decorate channel video moderation TypeError: Cannot read properties of undefined (reading 'decorateVideo')
- **Occurrences:** 1
- **Sources:** test_unit.log
- **Suggested Owner:** QA Team
- **Fingerprint:** `abfcb1f2`

**Stack Trace / Details:**
```
[ChannelProfile] Failed to decorate channel video moderation TypeError: Cannot read properties of undefined (reading 'decorateVideo')
at Application.decorateVideoModeration (file://$REPO/js/app.js:6598:37)
at decorateChannelVideo (file://$REPO/js/channelProfile.js:210:29)
at resolveChannelModeration (file://$REPO/js/channelProfile.js:917:23)
at applyChannelVisualBlur (file://$REPO/js/channelProfile.js:962:22)
at updateChannelModerationVisuals (file://$REPO/js/channelProfile.js:1027:18)
at renderChannelVideosFromList (file://$REPO/js/channelProfile.js:4893:3)
at async TestContext.<anonymous> (file://$REPO/tests$REPO/channel-profile-moderation.test.mjs:383:3)
at async Test.run (node:internal/test_runner/test:1054:7)
at async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
```

### [High] [ChannelProfile] Failed to decorate channel video moderation TypeError: Cannot read properties of undefined (reading 'decorateVideo')
- **Occurrences:** 1
- **Sources:** test_unit.log
- **Suggested Owner:** QA Team
- **Fingerprint:** `ff2d20dc`

**Stack Trace / Details:**
```
[ChannelProfile] Failed to decorate channel video moderation TypeError: Cannot read properties of undefined (reading 'decorateVideo')
at Application.decorateVideoModeration (file://$REPO/js/app.js:6598:37)
at decorateChannelVideo (file://$REPO/js/channelProfile.js:210:29)
at resolveChannelModeration (file://$REPO/js/channelProfile.js:917:23)
at applyChannelVisualBlur (file://$REPO/js/channelProfile.js:962:22)
at TestContext.<anonymous> (file://$REPO/tests$REPO/channel-profile-moderation.test.mjs:390:3)
at async Test.run (node:internal/test_runner/test:1054:7)
at async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
```

### [High] [ChannelProfile] Failed to decorate channel video moderation TypeError: Cannot read properties of undefined (reading 'decorateVideo')
- **Occurrences:** 1
- **Sources:** test_unit.log
- **Suggested Owner:** Unassigned
- **Fingerprint:** `812d9b22`

**Stack Trace / Details:**
```
[ChannelProfile] Failed to decorate channel video moderation TypeError: Cannot read properties of undefined (reading 'decorateVideo')
at Application.decorateVideoModeration (file://$REPO/js/app.js:6598:37)
at decorateChannelVideo (file://$REPO/js/channelProfile.js:210:29)
at resolveChannelModeration (file://$REPO/js/channelProfile.js:917:23)
at applyChannelVisualBlur (file://$REPO/js/channelProfile.js:962:22)
at updateChannelModerationVisuals (file://$REPO/js/channelProfile.js:1027:18)
at handleChannelModerationOverride (file://$REPO/js/channelProfile.js:804:5)
at channelModerationBadgeState.boundOverride (file://$REPO/js/channelProfile.js:570:7)
at HTMLButtonElement.callTheUserObjectsOperation ($REPO/node_modules/jsdom/lib/jsdom/living/generated/EventListener.js:26:30)
at innerInvokeEventListeners ($REPO/node_modules/jsdom/lib/jsdom/living/events/EventTarget-impl.js:350:25)
at invokeEventListeners ($REPO/node_modules/jsdom/lib/jsdom/living/events/EventTarget-impl.js:286:3)
```


---
*Privacy Notice: PII (IPs, emails, keys) has been sanitized from this report.*
