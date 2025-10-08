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
});
