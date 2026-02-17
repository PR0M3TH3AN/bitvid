import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  createVideoMoreMenuPanel,
  createVideoShareMenuPanel,
  createChannelProfileMenuPanel,
  createVideoSettingsMenuPanel,
} from '../../../js/ui/components/videoMenuRenderers.js';

function setupDom() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'https://example.com',
  });
  return { window: dom.window, document: dom.window.document };
}

test('createVideoMoreMenuPanel - basic rendering', () => {
  const { document } = setupDom();
  const video = {
    id: 'event-123',
    pubkey: 'pubkey-123',
    title: 'Test Video',
    description: 'Test Description',
    thumbnail: 'thumbnail.jpg',
    isPrivate: false,
    kind: 30078,
  };

  const panel = createVideoMoreMenuPanel({
    document,
    video,
    context: 'card',
  });

  assert.ok(panel, 'Panel should be created');
  assert.equal(panel.dataset.menu, 'video-more');
  assert.equal(panel.dataset.menuContext, 'card');

  // Check common actions
  const openChannel = panel.querySelector('[data-action="open-channel"]');
  assert.ok(openChannel, 'Open channel button exists');
  assert.equal(openChannel.dataset.author, video.pubkey);

  const copyLink = panel.querySelector('[data-action="copy-link"]');
  assert.ok(copyLink, 'Copy link button exists');
  assert.equal(copyLink.dataset.eventId, video.id);

  // Check Boost heading
  const headings = Array.from(panel.querySelectorAll('.menu__heading'));
  assert.ok(headings.some(h => h.textContent === 'Boost on Nostr…'), 'Boost heading exists');

  // Check Repost
  const repost = panel.querySelector('[data-action="repost-event"]');
  assert.ok(repost, 'Repost button exists');
  assert.equal(repost.dataset.eventId, video.id);

  // Check Mute/Block/Report
  assert.ok(panel.querySelector('[data-action="mute-author"]'), 'Mute button exists');
  assert.ok(panel.querySelector('[data-action="block-author"]'), 'Block button exists');
  assert.ok(panel.querySelector('[data-action="report"]'), 'Report button exists');
});

test('createVideoMoreMenuPanel - pointer info rendering', () => {
  const { document } = setupDom();
  const video = { id: 'v1', pubkey: 'p1' };
  const pointerInfo = {
    key: 'history-key',
    pointer: ['a', 'value', 'relay'],
  };

  const panel = createVideoMoreMenuPanel({
    document,
    video,
    pointerInfo,
  });

  const removeHistory = panel.querySelector('[data-action="remove-history"]');
  assert.ok(removeHistory, 'Remove from history button exists');
  assert.equal(removeHistory.dataset.pointerKey, 'history-key');
  assert.equal(removeHistory.dataset.pointerValue, 'value');
  assert.equal(removeHistory.dataset.pointerRelay, 'relay');
});

test('createVideoMoreMenuPanel - mirror logic', () => {
  const { document } = setupDom();
  const video = { id: 'v1', isPrivate: false };
  const playbackUrl = 'https://example.com/video.mp4';
  const playbackMagnet = 'magnet:?xt=urn:btih:123';

  const panel = createVideoMoreMenuPanel({
    document,
    video,
    playbackUrl,
    playbackMagnet,
  });

  const mirror = panel.querySelector('[data-action="mirror-video"]');
  assert.ok(mirror, 'Mirror button exists');
  assert.equal(mirror.dataset.url, playbackUrl);
  assert.equal(mirror.dataset.magnet, playbackMagnet);
  assert.equal(mirror.dataset.isPrivate, 'false');
});

test('createVideoMoreMenuPanel - blacklist logic', () => {
  const { document } = setupDom();
  const video = { id: 'v1', pubkey: 'p1' };

  const panel = createVideoMoreMenuPanel({
    document,
    video,
    canManageBlacklist: true,
  });

  const blacklist = panel.querySelector('[data-action="blacklist-author"]');
  assert.ok(blacklist, 'Blacklist button exists');
  assert.equal(blacklist.dataset.variant, 'critical');
});

test('createVideoShareMenuPanel - permission logic', () => {
  const { document } = setupDom();
  const video = { id: 'v1' };

  // Case 1: Not logged in
  const panel1 = createVideoShareMenuPanel({
    document,
    video,
    isLoggedIn: false,
    hasSigner: false,
  });
  const nostrBtn1 = panel1.querySelector('[data-action="share-nostr"]');
  assert.ok(nostrBtn1.disabled, 'Share on Nostr should be disabled when not logged in');

  // Case 2: Logged in but no signer
  const panel2 = createVideoShareMenuPanel({
    document,
    video,
    isLoggedIn: true,
    hasSigner: false,
  });
  const nostrBtn2 = panel2.querySelector('[data-action="share-nostr"]');
  assert.ok(nostrBtn2.disabled, 'Share on Nostr should be disabled without signer');

  // Case 3: Logged in with signer
  const panel3 = createVideoShareMenuPanel({
    document,
    video,
    isLoggedIn: true,
    hasSigner: true,
  });
  const nostrBtn3 = panel3.querySelector('[data-action="share-nostr"]');
  assert.ok(!nostrBtn3.disabled, 'Share on Nostr should be enabled with signer');
});

test('createVideoShareMenuPanel - magnet/cdn logic', () => {
  const { document } = setupDom();
  const video = { id: 'v1' };

  const panel = createVideoShareMenuPanel({
    document,
    video,
    hasMagnet: true,
    hasCdn: false,
  });

  const magnetBtn = panel.querySelector('[data-action="copy-magnet"]');
  assert.ok(!magnetBtn.disabled, 'Magnet button should be enabled');

  const cdnBtn = panel.querySelector('[data-action="copy-cdn"]');
  assert.ok(cdnBtn.disabled, 'CDN button should be disabled');
});

test('createChannelProfileMenuPanel - basic actions', () => {
  const { document } = setupDom();
  const panel = createChannelProfileMenuPanel({
    document,
    context: 'profile',
  });

  assert.equal(panel.dataset.menu, 'channel-profile');
  assert.ok(panel.querySelector('[data-action="copy-npub"]'), 'Copy npub exists');
  assert.ok(panel.querySelector('[data-action="mute-author"]'), 'Mute author exists');
  assert.ok(panel.querySelector('[data-action="report"]'), 'Report exists');
});

test('createVideoSettingsMenuPanel - capabilities', () => {
  const { document } = setupDom();
  const video = { id: 'v1' };

  // Case 1: Edit only
  const panel1 = createVideoSettingsMenuPanel({
    document,
    video,
    capabilities: { canEdit: true },
  });
  assert.ok(panel1.querySelector('[data-action="edit"]'), 'Edit button exists');
  assert.ok(!panel1.querySelector('[data-action="revert"]'), 'Revert button absent');
  assert.ok(!panel1.querySelector('[data-action="delete"]'), 'Delete button absent');

  // Case 2: Full capabilities
  const panel2 = createVideoSettingsMenuPanel({
    document,
    video,
    capabilities: { canEdit: true, canRevert: true, canDelete: true },
  });
  assert.ok(panel2.querySelector('[data-action="revert"]'), 'Revert button exists');
  assert.ok(panel2.querySelector('[data-action="delete"]'), 'Delete button exists');
});
