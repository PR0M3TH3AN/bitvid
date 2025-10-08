import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { EditModal } from '../js/ui/components/EditModal.js';

const editModalHtml = await readFile(
  new URL('../components/edit-video-modal.html', import.meta.url),
  'utf8',
);

let dom;
let container;
let modal;

beforeEach(async () => {
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
  global.Node = dom.window.Node;
  global.CustomEvent = dom.window.CustomEvent;
  global.Event = dom.window.Event;
  global.EventTarget = dom.window.EventTarget;

  window.requestAnimationFrame = (callback) => callback(0);
  window.cancelAnimationFrame = () => {};
  global.requestAnimationFrame = window.requestAnimationFrame;
  global.cancelAnimationFrame = window.cancelAnimationFrame;

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

  modal = new EditModal({ container, eventTarget: new window.EventTarget() });
  await modal.load({ container });
});

afterEach(() => {
  delete global.fetch;
  delete global.cancelAnimationFrame;
  delete global.requestAnimationFrame;
  delete global.Event;
  delete global.CustomEvent;
  delete global.EventTarget;
  delete global.Node;
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
  modal = null;
});

test('submit keeps original private state when untouched', async () => {
  const video = {
    id: 'video-123',
    pubkey: 'pubkey',
    title: 'Example video',
    url: 'https://cdn.example.com/video.mp4',
    isPrivate: true,
    enableComments: true,
  };

  await modal.open(video);

  const isPrivateInput = modal.fields.isPrivate;
  assert.ok(isPrivateInput, 'expected isPrivate input to exist');
  assert.equal(isPrivateInput.disabled, true);
  assert.equal(isPrivateInput.checked, true);
  assert.equal(isPrivateInput.dataset.originalValue, 'true');

  let submitDetail;
  modal.addEventListener('video:edit-submit', (event) => {
    submitDetail = event.detail;
  });

  modal.submit();

  assert.ok(submitDetail, 'expected submit event detail');
  assert.equal(submitDetail.updatedData.isPrivate, true);
  assert.equal(submitDetail.updatedData.isPrivateEdited, false);
});

test('toggling private flag marks it as edited', async () => {
  const video = {
    id: 'video-456',
    pubkey: 'pubkey',
    title: 'Example video',
    url: 'https://cdn.example.com/video.mp4',
    isPrivate: false,
    enableComments: true,
  };

  await modal.open(video);

  const isPrivateInput = modal.fields.isPrivate;
  const toggleButton = modal
    .getRoot()
    .querySelector('[data-edit-target="editVideoIsPrivate"]');

  assert.ok(toggleButton, 'expected edit toggle for isPrivate');

  toggleButton.click();
  assert.equal(isPrivateInput.disabled, false);

  isPrivateInput.checked = true;

  let submitDetail;
  modal.addEventListener('video:edit-submit', (event) => {
    submitDetail = event.detail;
  });

  modal.submit();

  assert.ok(submitDetail, 'expected submit event detail');
  assert.equal(submitDetail.updatedData.isPrivate, true);
  assert.equal(submitDetail.updatedData.isPrivateEdited, true);
});

test('restoring private flag clears edit tracking', async () => {
  const video = {
    id: 'video-789',
    pubkey: 'pubkey',
    title: 'Example video',
    url: 'https://cdn.example.com/video.mp4',
    isPrivate: false,
    enableComments: true,
  };

  await modal.open(video);

  const isPrivateInput = modal.fields.isPrivate;
  const toggleButton = modal
    .getRoot()
    .querySelector('[data-edit-target="editVideoIsPrivate"]');

  toggleButton.click();
  isPrivateInput.checked = true;
  toggleButton.click();

  assert.equal(isPrivateInput.disabled, true);
  assert.equal(isPrivateInput.checked, false);

  let submitDetail;
  modal.addEventListener('video:edit-submit', (event) => {
    submitDetail = event.detail;
  });

  modal.submit();

  assert.ok(submitDetail, 'expected submit event detail');
  assert.equal(submitDetail.updatedData.isPrivate, false);
  assert.equal(submitDetail.updatedData.isPrivateEdited, false);
});
