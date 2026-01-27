
import { subscriptions } from './js/subscriptions.js';
import { hashtagPreferences } from './js/services/hashtagPreferencesService.js';
import { profileCache } from './js/state/profileCache.js';

// Mock profileCache.getProfileData
const originalGetProfileData = profileCache.getProfileData;
const originalGet = profileCache.get;

let calls = [];

profileCache.getProfileData = (pubkey, section) => {
  calls.push({ method: 'getProfileData', pubkey, section });
  return null;
};

profileCache.get = (section) => {
  calls.push({ method: 'get', section });
  return null;
};

async function runVerify() {
  console.log("Verifying fix...");

  // Test SubscriptionsManager
  const subPubkey = "0000000000000000000000000000000000000000000000000000000000000001";
  // We need to mock updateFromRelays to avoid network calls, or just catch error
  subscriptions.updateFromRelays = async () => {};

  await subscriptions.loadSubscriptions(subPubkey);

  const subCall = calls.find(c => c.section === "subscriptions");
  if (subCall && subCall.method === "getProfileData" && subCall.pubkey === subPubkey) {
    console.log("PASS: subscriptions.loadSubscriptions used getProfileData with correct pubkey.");
  } else {
    console.error("FAIL: subscriptions.loadSubscriptions did not use getProfileData correctly.", calls);
    process.exit(1);
  }

  calls = []; // Reset

  // Test HashtagPreferencesService
  const tagPubkey = "0000000000000000000000000000000000000000000000000000000000000002";
  // Mock load logic to avoid network
  hashtagPreferences.loadFromCache(tagPubkey);

  const tagCall = calls.find(c => c.section === "interests");
  if (tagCall && tagCall.method === "getProfileData" && tagCall.pubkey === tagPubkey) {
    console.log("PASS: hashtagPreferences.loadFromCache used getProfileData with correct pubkey.");
  } else {
    console.error("FAIL: hashtagPreferences.loadFromCache did not use getProfileData correctly.", calls);
    process.exit(1);
  }

  console.log("All verifications passed.");
}

runVerify().catch(err => {
  console.error(err);
  process.exit(1);
});
