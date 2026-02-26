import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  createVideoMoreMenuPanel,
  createVideoShareMenuPanel,
  createChannelProfileMenuPanel,
  createVideoSettingsMenuPanel,
} from '../js/ui/components/videoMenuRenderers.js';

// Setup JSDOM environment for tests
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
const { window } = dom;
const { document } = window;

// Helper to check if an element has a specific class
function hasClass(element, className) {
  return element.classList.contains(className);
}

// Helper to find a button by action dataset
function findButtonByAction(container, action) {
  return container.querySelector(`button[data-action="${action}"]`);
}

test('createVideoMoreMenuPanel - basic structure', () => {
  const panel = createVideoMoreMenuPanel({
    document,
    video: { id: 'test-id', pubkey: 'test-pubkey' },
    context: 'test-context',
  });

  assert.ok(panel, 'Panel should be created');
  assert.equal(panel.tagName, 'DIV');
  assert.equal(panel.dataset.menu, 'video-more');
  assert.ok(hasClass(panel, 'popover__panel'));

  const list = panel.querySelector('.menu');
  assert.ok(list, 'Menu list should exist');

  // Check standard actions
  const openChannelBtn = findButtonByAction(panel, 'open-channel');
  assert.ok(openChannelBtn, 'Open channel button should exist');
  assert.equal(openChannelBtn.dataset.author, 'test-pubkey');

  const copyLinkBtn = findButtonByAction(panel, 'copy-link');
  assert.ok(copyLinkBtn, 'Copy link button should exist');
  assert.equal(copyLinkBtn.dataset.eventId, 'test-id');

  // Check moderation actions that are always present
  const muteBtn = findButtonByAction(panel, 'mute-author');
  assert.ok(muteBtn, 'Mute author button should exist');

  const unmuteBtn = findButtonByAction(panel, 'unmute-author');
  assert.ok(unmuteBtn, 'Unmute author button should exist');

  const blockBtn = findButtonByAction(panel, 'block-author');
  assert.ok(blockBtn, 'Block author button should exist');
  assert.equal(blockBtn.dataset.variant, 'critical');

  const reportBtn = findButtonByAction(panel, 'report');
  assert.ok(reportBtn, 'Report button should exist');

  const detailsBtn = findButtonByAction(panel, 'event-details');
  assert.ok(detailsBtn, 'Event details button should exist');
});

test('createVideoMoreMenuPanel - null document returns null', () => {
  const panel = createVideoMoreMenuPanel({ document: null });
  assert.equal(panel, null);
});

test('createVideoMoreMenuPanel - boost on nostr section', () => {
  const panel = createVideoMoreMenuPanel({
    document,
    video: { id: 'test-id', pubkey: 'test-pubkey', kind: 30009 },
  });

  const heading = panel.querySelector('.menu__heading');
  assert.ok(heading, 'Heading should exist');
  assert.match(heading.textContent, /Boost on Nostr/);

  const repostBtn = findButtonByAction(panel, 'repost-event');
  assert.ok(repostBtn, 'Repost button should exist');
  assert.equal(repostBtn.dataset.eventId, 'test-id');
  assert.equal(repostBtn.dataset.kind, '30009');
});

test('createVideoMoreMenuPanel - playbackUrl adds mirror action', () => {
  const panel = createVideoMoreMenuPanel({
    document,
    video: { id: 'test-id', pubkey: 'test-pubkey', isPrivate: false },
    playbackUrl: 'https://example.com/video.mp4',
  });

  const mirrorBtn = findButtonByAction(panel, 'mirror-video');
  assert.ok(mirrorBtn, 'Mirror button should exist');
  assert.equal(mirrorBtn.dataset.url, 'https://example.com/video.mp4');
  assert.equal(mirrorBtn.dataset.isPrivate, 'false');
});

test('createVideoMoreMenuPanel - pointerInfo adds remove history action', () => {
  const pointerInfo = {
    pointer: ['e', 'event-id', 'relay-url'],
    key: 'test-key',
  };

  const panel = createVideoMoreMenuPanel({
    document,
    video: { id: 'test-id', pubkey: 'test-pubkey' },
    pointerInfo,
  });

  const removeBtn = findButtonByAction(panel, 'remove-history');
  assert.ok(removeBtn, 'Remove from history button should exist');
  assert.equal(removeBtn.dataset.pointerKey, 'test-key');
  assert.equal(removeBtn.dataset.pointerValue, 'event-id');
});

test('createVideoMoreMenuPanel - canManageBlacklist adds blacklist action', () => {
  const panel = createVideoMoreMenuPanel({
    document,
    video: { id: 'test-id', pubkey: 'test-pubkey' },
    canManageBlacklist: true,
  });

  const blacklistBtn = findButtonByAction(panel, 'blacklist-author');
  assert.ok(blacklistBtn, 'Blacklist button should exist');
  assert.equal(blacklistBtn.dataset.variant, 'critical');
});

test('createVideoShareMenuPanel - share actions state', () => {
  const panel = createVideoShareMenuPanel({
    document,
    video: { id: 'test-id' },
    isLoggedIn: true,
    hasSigner: true,
    hasMagnet: true,
    hasCdn: true,
  });

  assert.equal(panel.dataset.menu, 'video-share');

  const copyUrlBtn = findButtonByAction(panel, 'share');
  assert.ok(copyUrlBtn, 'Copy URL button should exist');

  const shareNostrBtn = findButtonByAction(panel, 'share-nostr');
  assert.ok(shareNostrBtn, 'Share on Nostr button should exist');
  assert.equal(shareNostrBtn.disabled, false);

  const copyMagnetBtn = findButtonByAction(panel, 'copy-magnet');
  assert.ok(copyMagnetBtn, 'Copy Magnet button should exist');
  assert.equal(copyMagnetBtn.disabled, false);

  const copyCdnBtn = findButtonByAction(panel, 'copy-cdn');
  assert.ok(copyCdnBtn, 'Copy CDN button should exist');
  assert.equal(copyCdnBtn.disabled, false);
});

test('createVideoShareMenuPanel - share actions disabled state', () => {
  const panel = createVideoShareMenuPanel({
    document,
    video: { id: 'test-id' },
    isLoggedIn: false,
    hasSigner: false,
    hasMagnet: false,
    hasCdn: false,
  });

  const shareNostrBtn = findButtonByAction(panel, 'share-nostr');
  assert.equal(shareNostrBtn.disabled, true);
  assert.ok(hasClass(shareNostrBtn, 'cursor-not-allowed'));

  const copyMagnetBtn = findButtonByAction(panel, 'copy-magnet');
  assert.equal(copyMagnetBtn.disabled, true);

  const copyCdnBtn = findButtonByAction(panel, 'copy-cdn');
  assert.equal(copyCdnBtn.disabled, true);
});

test('createChannelProfileMenuPanel - structure and actions', () => {
  const panel = createChannelProfileMenuPanel({
    document,
    context: 'custom-context',
  });

  assert.equal(panel.dataset.menu, 'channel-profile');
  assert.equal(panel.dataset.menuContext, 'custom-context');

  const actions = [
    'copy-npub',
    'mute-author',
    'unmute-author',
    'blacklist-author',
    'block-author',
    'report',
  ];

  actions.forEach(action => {
    const btn = findButtonByAction(panel, action);
    assert.ok(btn, `Button for ${action} should exist`);
    assert.equal(btn.dataset.context, 'custom-context');
  });
});

test('createVideoSettingsMenuPanel - edit and conditional actions', () => {
  const capabilities = {
    canEdit: true,
    canRevert: true,
    canDelete: true,
  };

  const panel = createVideoSettingsMenuPanel({
    document,
    video: { id: 'test-id' },
    index: 5,
    capabilities,
  });

  assert.equal(panel.dataset.menu, 'video-settings');

  const editBtn = findButtonByAction(panel, 'edit');
  assert.ok(editBtn, 'Edit button should exist');
  assert.equal(editBtn.dataset.index, '5');

  const revertBtn = findButtonByAction(panel, 'revert');
  assert.ok(revertBtn, 'Revert button should exist');
  assert.equal(revertBtn.dataset.variant, 'critical');

  const deleteBtn = findButtonByAction(panel, 'delete');
  assert.ok(deleteBtn, 'Delete button should exist');
  assert.equal(deleteBtn.dataset.variant, 'critical');
});

test('createVideoSettingsMenuPanel - missing capabilities', () => {
  const capabilities = {
    canEdit: true,
    canRevert: false,
    canDelete: false,
  };

  const panel = createVideoSettingsMenuPanel({
    document,
    video: { id: 'test-id' },
    capabilities,
  });

  const revertBtn = findButtonByAction(panel, 'revert');
  assert.equal(revertBtn, null, 'Revert button should not exist');

  const deleteBtn = findButtonByAction(panel, 'delete');
  assert.equal(deleteBtn, null, 'Delete button should not exist');
});
