import test from 'node:test';
import assert from 'node:assert/strict';
import MoreMenuController from '../js/ui/moreMenuController.js';

test('copy-link action writes to clipboard and shows success', async () => {
  let copied = null;
  const clipboard = {
    writeText: async (text) => {
      copied = text;
    },
  };

  const messages = { error: [], success: [] };

  const controller = new MoreMenuController({
    clipboard,
    callbacks: {
      buildShareUrlFromEventId: (eventId) => `https://example.com/watch/${eventId}`,
      showError: (message) => messages.error.push(message),
      showSuccess: (message) => messages.success.push(message),
      getCurrentVideo: () => ({ id: 'fallback-id' }),
    },
  });

  await controller.handleMoreMenuAction('copy-link', { eventId: 'abc123' });
  await Promise.resolve();

  assert.equal(copied, 'https://example.com/watch/abc123');
  assert.deepEqual(messages.error, []);
  assert.deepEqual(messages.success, ['Video link copied to clipboard!']);
});

test('blacklist-author requires moderator access and refreshes subscriptions', async () => {
  const calls = [];
  const accessControl = {
    ensureReady: async () => {
      calls.push('ensureReady');
    },
    canEditAdminLists: (actorNpub) => {
      calls.push(['canEdit', actorNpub]);
      return true;
    },
    addToBlacklist: async (actorNpub, targetNpub) => {
      calls.push(['add', actorNpub, targetNpub]);
      return { ok: true };
    },
  };

  let refreshedWith = null;
  const subscriptions = {
    refreshActiveFeed: async (args) => {
      refreshedWith = args;
    },
  };

  const controller = new MoreMenuController({
    accessControl,
    subscriptions,
    callbacks: {
      getCurrentUserNpub: () => 'npub1actor',
      getCurrentVideo: () => ({ pubkey: 'authorhex' }),
      safeEncodeNpub: (pubkey) => `npub:${pubkey}`,
      showError: (message) => {
        throw new Error(`Unexpected error: ${message}`);
      },
      showSuccess: (message) => {
        calls.push(['success', message]);
      },
      canCurrentUserManageBlacklist: () => true,
    },
  });

  await controller.handleMoreMenuAction('blacklist-author', {
    author: 'authorhex',
  });

  assert.deepEqual(calls, [
    'ensureReady',
    ['canEdit', 'npub1actor'],
    ['add', 'npub1actor', 'npub:authorhex'],
    ['success', 'Creator added to the blacklist.'],
  ]);
  assert.deepEqual(refreshedWith, { reason: 'admin-blacklist-update' });
});

test('blacklist-author shows error when no moderator session is available', async () => {
  const errors = [];
  const controller = new MoreMenuController({
    callbacks: {
      getCurrentUserNpub: () => null,
      showError: (message) => errors.push(message),
      getCurrentVideo: () => ({ pubkey: 'authorhex' }),
    },
  });

  await controller.handleMoreMenuAction('blacklist-author', {
    author: 'authorhex',
  });

  assert.deepEqual(errors, [
    'Please login as a moderator to manage the blacklist.',
  ]);
});

test('block-author updates user blocks, reloads videos, and refreshes feeds', async () => {
  const events = [];
  const userBlocks = {
    ensureLoaded: async (pubkey) => {
      events.push(['ensureLoaded', pubkey]);
    },
    isBlocked: (pubkey) => {
      events.push(['isBlocked', pubkey]);
      return false;
    },
    addBlock: async (target, actor) => {
      events.push(['addBlock', target, actor]);
    },
  };

  const subscriptions = {
    refreshActiveFeed: async (args) => {
      events.push(['refreshActiveFeed', args]);
    },
  };

  const controller = new MoreMenuController({
    userBlocks,
    subscriptions,
    callbacks: {
      getCurrentUserPubkey: () => 'actorhex',
      getCurrentVideo: () => ({ pubkey: 'fallbackhex' }),
      safeDecodeNpub: (npub) => (npub === 'npub1target' ? 'targethex' : ''),
      showError: (message) => {
        throw new Error(`Unexpected error: ${message}`);
      },
      showSuccess: (message) => {
        events.push(['success', message]);
      },
      loadVideos: async () => {
        events.push(['loadVideos']);
      },
      onUserBlocksUpdated: () => {
        events.push(['refreshBlockedList']);
      },
    },
  });

  await controller.handleMoreMenuAction('block-author', {
    author: 'npub1target',
  });

  assert.deepEqual(events, [
    ['ensureLoaded', 'actorhex'],
    ['isBlocked', 'targethex'],
    ['addBlock', 'targethex', 'actorhex'],
    ['success', "Creator blocked. You won't see their videos anymore."],
    ['refreshBlockedList'],
    ['loadVideos'],
    ['refreshActiveFeed', { reason: 'user-block-update' }],
  ]);
});
