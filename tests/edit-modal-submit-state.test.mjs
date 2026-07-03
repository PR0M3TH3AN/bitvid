import test, { beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

import { EditModal } from '../js/ui/components/EditModal.js';

const editModalHtml = await readFile(
  new URL('../components/edit-video-modal.html', import.meta.url),
  'utf8',
);

let dom;
let container;

beforeEach(() => {
  dom = new JSDOM(
    '<!DOCTYPE html><html><body><div id="modalContainer"></div></body></html>',
    {
      url: 'https://example.com',
      pretendToBeVisual: true,
    },
  );

  global.window = dom.window;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.HTMLInputElement = dom.window.HTMLInputElement;
  global.HTMLButtonElement = dom.window.HTMLButtonElement;
  global.CustomEvent = dom.window.CustomEvent;
  global.Event = dom.window.Event;
  global.EventTarget = dom.window.EventTarget;

  container = document.getElementById('modalContainer');

  global.fetch = async (resource) => {
    if (
      typeof resource === 'string' &&
      resource.includes('components/edit-video-modal.html')
    ) {
      return {
        ok: true,
        status: 200,
        text: async () => editModalHtml,
      };
    }

    throw new Error(`Unexpected fetch: ${resource}`);
  };
});

afterEach(() => {
  delete global.fetch;
  delete global.EventTarget;
  delete global.Event;
  delete global.CustomEvent;
  delete global.HTMLButtonElement;
  delete global.HTMLInputElement;
  delete global.HTMLElement;
  delete global.document;
  delete global.window;

  if (dom) {
    dom.window.close();
    dom = null;
  }
  container = null;
});

function createModal({
  showError,
  eventTarget = new EventTarget(),
} = {}) {
  return new EditModal({
    removeTrackingScripts: () => {},
    setGlobalModalState: () => {},
    showError: showError || (() => {}),
    getMode: () => 'live',
    eventTarget,
    container,
  });
}

test('ignores additional submissions while pending without spurious errors', async () => {
  const errorMessages = [];
  const modalEvents = new EventTarget();
  const modal = createModal({
    showError: (message) => {
      if (message) {
        errorMessages.push(message);
      }
    },
    eventTarget: modalEvents,
  });

  await modal.load({ container });

  const video = {
    id: 'video1',
    pubkey: 'pubkey1',
    title: 'Sample video',
    url: 'https://example.com/video.mp4',
    thumbnail: '',
    description: '',
    enableComments: true,
    isPrivate: false,
    isNsfw: true,
    isForKids: false,
  };

  await modal.open(video);

  assert.ok(modal.submitButton, 'expected submit button to be cached');
  assert.equal(modal.submitButton.disabled, false);

  const submissions = [];
  modal.addEventListener('video:edit-submit', (event) => {
    submissions.push(event.detail);
  });

  modal.submit();

  assert.equal(submissions.length, 1, 'first submit should emit once');
  assert.equal(modal.pendingSubmit, true, 'pending flag should be set after submit');
  assert.equal(
    modal.pendingSubmitVideo?.id,
    video.id,
    'pending video context should match the edited video',
  );
  assert.equal(modal.submitButton.disabled, true, 'button should disable while pending');

  const firstSubmission = submissions[0];
  assert.ok(firstSubmission, 'expected first submission payload');
  assert.equal(
    firstSubmission.updatedData.isNsfw,
    true,
    'locked NSFW flag should persist in emitted payload',
  );
  assert.equal(
    firstSubmission.updatedData.isForKids,
    false,
    'locked kids flag should persist in emitted payload',
  );

  modal.submit();

  assert.equal(submissions.length, 1, 'duplicate submit should be ignored');
  assert.equal(
    errorMessages.includes('No video selected for editing.'),
    false,
    'should not surface missing video error during pending submit',
  );

  modal.setSubmitState({ pending: false });

  assert.equal(modal.pendingSubmit, false, 'pending flag should reset after release');
  assert.equal(modal.submitButton.disabled, false, 'button should re-enable after release');

  const unlockButton = (selector) =>
    modal.root.querySelector(selector)?.dispatchEvent(
      new dom.window.Event('click', { bubbles: true }),
    );

  unlockButton('[data-edit-target="editVideoIsNsfw"]');
  unlockButton('[data-edit-target="editVideoIsForKids"]');

  const nsfwCheckbox = modal.fields.isNsfw;
  const kidsCheckbox = modal.fields.isForKids;

  assert.ok(nsfwCheckbox, 'expected nsfw checkbox to be cached');
  assert.ok(kidsCheckbox, 'expected kids checkbox to be cached');

  nsfwCheckbox.checked = false;
  kidsCheckbox.checked = true;

  modal.submit();

  assert.equal(submissions.length, 2, 'unlocked submit should emit again');
  const secondSubmission = submissions[1];
  assert.ok(secondSubmission, 'expected second submission payload');
  assert.equal(
    secondSubmission.updatedData.isNsfw,
    false,
    'updated NSFW flag should reflect unlocked checkbox state',
  );
  assert.equal(
    secondSubmission.updatedData.isForKids,
    true,
    'updated kids flag should reflect unlocked checkbox state',
  );

  modal.setSubmitState({ pending: false });
});

test('editing the magnet refreshes torrent hints when ws/xs remain locked', async () => {
  const modal = createModal();
  await modal.load({ container });

  const originalMagnet =
    'magnet:?xt=urn:btih:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&ws=https://old.example/video.mp4&xs=https://old.example/video.torrent';
  const video = {
    id: 'video-magnet-locked',
    pubkey: 'pubkey-magnet-locked',
    title: 'Locked hints example',
    url: 'https://example.com/locked.mp4',
    magnet: originalMagnet,
    ws: 'https://old.example/video.mp4',
    xs: 'https://old.example/video.torrent',
  };

  await modal.open(video);

  const submissions = [];
  modal.addEventListener('video:edit-submit', (event) => {
    submissions.push(event.detail);
  });

  const magnetButton = modal.root.querySelector(
    '[data-edit-target="editVideoMagnet"]',
  );
  assert.ok(magnetButton, 'expected magnet unlock button to exist');
  magnetButton.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

  const magnetInput = modal.fields.magnet;
  assert.ok(magnetInput, 'expected magnet input to exist');
  magnetInput.value =
    'magnet:?xt=urn:btih:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb&ws=https://new.example/video.mp4&xs=https://new.example/video.torrent';

  modal.submit();

  assert.equal(submissions.length, 1, 'should emit a single submission payload');
  const submission = submissions[0];
  assert.ok(submission, 'expected edit submission detail');

  assert.equal(
    submission.updatedData.wsEdited,
    true,
    'ws should be marked as edited when magnet changes',
  );
  assert.equal(
    submission.updatedData.xsEdited,
    true,
    'xs should be marked as edited when magnet changes',
  );
  assert.equal(
    submission.updatedData.ws,
    'https://new.example/video.mp4',
    'ws hint should refresh to the new magnet hint',
  );
  assert.equal(
    submission.updatedData.xs,
    'https://new.example/video.torrent',
    'xs hint should refresh to the new magnet hint',
  );
  assert.ok(
    submission.updatedData.magnet.includes(
      'urn:btih:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    ),
    'normalized magnet should contain the updated info hash',
  );
  assert.ok(
    submission.updatedData.magnet.includes('ws=https://new.example/video.mp4'),
    'normalized magnet should include the refreshed ws hint',
  );
  assert.ok(
    submission.updatedData.magnet.includes(
      'xs=https://new.example/video.torrent',
    ),
    'normalized magnet should include the refreshed xs hint',
  );

  modal.setSubmitState({ pending: false });
});

test('does not show missing video error after modal closes', async () => {
  const errorMessages = [];
  const modal = createModal({
    showError: (message) => {
      if (message) {
        errorMessages.push(message);
      }
    },
  });

  await modal.load({ container });

  const video = {
    id: 'video2',
    pubkey: 'pubkey2',
    title: 'Another video',
    url: 'https://example.com/another.mp4',
  };

  await modal.open(video);

  modal.submit();

  assert.equal(errorMessages.includes('No video selected for editing.'), false);

  modal.setSubmitState({ pending: false });
  modal.close();

  assert.equal(modal.isVisible, false, 'modal should be hidden after close');

  modal.submit();

  assert.equal(
    errorMessages.includes('No video selected for editing.'),
    false,
    'should not surface missing video error when closed',
  );
});

// NIP-71 extras must survive a save now that the edit form only exposes hashtags
// (the rest of the NIP-71 section was removed for a cleaner UI). A hashtag edit
// must merge into the video's stored metadata — never replace it with the reduced
// form's empty fields.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-edit-nip71-preserved
//       given: "a video whose stored nip71 carries imeta/textTracks/participants"
//       when: "the user edits hashtags in the reduced form and submits"
//       then: "updatedData.nip71 keeps the extras AND the new hashtags; nip71Edited reflects the hashtag change"
//   observable_outcomes:
//     - "imeta/textTracks/participants/publishedAt survive the save"
//     - "hashtags (and a mirrored t key) update to the edited set"
//     - "no hashtag change -> nip71Edited stays false"
//   determinism_controls:
//     - "JSDOM modal against the real component HTML; no network"
//   anti_cheat_rationale:
//     prevents: ["asserting the wiping (broken) behavior", "over-mocking internal logic"]
//   relaxation:
//     did_relax_any_assertion: false

test('editing hashtags preserves stored NIP-71 extras instead of wiping them', async () => {
  const modal = createModal({ eventTarget: new EventTarget() });
  await modal.load({ container });

  const storedNip71 = {
    publishedAt: 1700000000,
    imeta: [{ url: 'https://cdn.example.com/v.mp4', m: 'video/mp4' }],
    textTracks: [{ url: 'https://cdn.example.com/v.vtt', type: 'captions' }],
    participants: [{ pubkey: 'a'.repeat(64) }],
    hashtags: ['old'],
    t: ['old'],
  };

  const video = {
    id: 'video-nip71',
    pubkey: 'pubkey1',
    title: 'Sample video',
    url: 'https://example.com/video.mp4',
    thumbnail: '',
    description: '',
    enableComments: true,
    isPrivate: false,
    isNsfw: false,
    isForKids: false,
    nip71: storedNip71,
  };

  await modal.open(video);

  // Edit hashtags through the reduced form (same path as the UI's Add hashtag).
  const entry = modal.nip71FormManager.addRepeaterEntry('edit', 't');
  modal.nip71FormManager.setFieldValue(entry, 'value', 'newtag');

  const submissions = [];
  modal.addEventListener('video:edit-submit', (event) => {
    submissions.push(event.detail);
  });

  await modal.submit();

  assert.equal(submissions.length, 1, 'submit emitted');
  const savedNip71 = submissions[0].updatedData.nip71;
  assert.equal(submissions[0].updatedData.nip71Edited, true, 'hashtag change detected');

  assert.deepEqual(savedNip71.imeta, storedNip71.imeta, 'imeta preserved');
  assert.deepEqual(savedNip71.textTracks, storedNip71.textTracks, 'text tracks preserved');
  assert.deepEqual(savedNip71.participants, storedNip71.participants, 'participants preserved');
  assert.equal(savedNip71.publishedAt, storedNip71.publishedAt, 'publishedAt preserved');
  assert.deepEqual(savedNip71.hashtags, ['old', 'newtag'], 'edited hashtags applied');
  assert.deepEqual(savedNip71.t, ['old', 'newtag'], 'mirrored t key kept in sync');
});

test('submitting without touching hashtags leaves nip71Edited false and extras intact', async () => {
  const modal = createModal({ eventTarget: new EventTarget() });
  await modal.load({ container });

  const storedNip71 = {
    imeta: [{ url: 'https://cdn.example.com/v.mp4', m: 'video/mp4' }],
    hashtags: ['keepme'],
  };

  const video = {
    id: 'video-nip71-b',
    pubkey: 'pubkey1',
    title: 'Sample video',
    url: 'https://example.com/video.mp4',
    thumbnail: '',
    description: '',
    enableComments: true,
    isPrivate: false,
    isNsfw: false,
    isForKids: false,
    nip71: storedNip71,
  };

  await modal.open(video);

  const submissions = [];
  modal.addEventListener('video:edit-submit', (event) => {
    submissions.push(event.detail);
  });

  await modal.submit();

  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].updatedData.nip71Edited, false, 'no hashtag change');
  assert.deepEqual(
    submissions[0].updatedData.nip71.imeta,
    storedNip71.imeta,
    'extras intact on an untouched save',
  );
  assert.deepEqual(submissions[0].updatedData.nip71.hashtags, ['keepme']);
});
