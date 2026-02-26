import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHeader,
  createDescription,
  createAudienceFlags,
  createEventMetadata,
  createNotePointers,
} from '../../../js/ui/components/revertModalRenderers.js';

// --- Mocks ---

class MockHTMLElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.className = '';
    this.textContent = '';
    this.children = [];
    this.attributes = {};
    this.dataset = {};
  }

  appendChild(child) {
    if (typeof child === 'string') {
        // Text node simulation
        this.children.push({ nodeType: 3, textContent: child });
    } else {
        this.children.push(child);
    }
    return child;
  }

  setAttribute(name, value) {
      this.attributes[name] = value;
  }

  hasChildNodes() {
      return this.children.length > 0;
  }
}

const documentMock = {
  createElement: (tagName) => new MockHTMLElement(tagName),
  createDocumentFragment: () => {
    const fragment = {
      nodeType: 11,
      children: [],
      appendChild(child) {
        this.children.push(child);
      }
    };
    return fragment;
  },
  createTextNode: (text) => ({ nodeType: 3, textContent: text }),
};

// Global document mock
globalThis.document = documentMock;

const utilsMock = {
  formatAbsoluteTimestamp: (ts) => `ABS:${ts}`,
  formatTimeAgo: (ts) => `AGO:${ts}`,
  truncateMiddle: (str) => `TRUNC:${str}`,
  createPlaceholder: (text) => {
    const s = new MockHTMLElement('span');
    s.textContent = text || 'PLACEHOLDER';
    return s;
  },
  createLinkMarkup: (url) => {
    const a = new MockHTMLElement('a');
    a.attributes.href = url;
    a.textContent = url;
    return a;
  },
  createListEmpty: (text) => {
      const p = new MockHTMLElement('p');
      p.textContent = text;
      return p;
  },
  formatDurationSeconds: (s) => `DUR:${s}`,
  fallbackThumbnailSrc: 'fallback.jpg',
};

// --- Tests ---

test('createHeader renders correctly', () => {
  const version = {
    created_at: 1234567890,
    title: 'Test Title',
    thumbnail: 'thumb.jpg',
    url: 'https://example.com',
    magnet: 'magnet:?xt=urn:btih:123',
    isNsfw: true,
    version: 2
  };
  const nip71Metadata = {};

  const header = createHeader(version, nip71Metadata, utilsMock);

  assert.equal(header.tagName, 'DIV');
  assert.ok(header.className.includes('space-y-6'));

  // Find title
  const h3 = findElement(header, 'H3');
  assert.equal(h3.textContent, 'Test Title');

  // Find timestamp
  // We expect "ABS:1234567890 (AGO:1234567890)"
  const p = findElement(header, 'P', (el) => el.textContent.includes('ABS:'));
  assert.ok(p);

  // Find NSFW pill
  const nsfwPill = findElement(header, 'SPAN', (el) => el.textContent === 'Marked NSFW');
  assert.ok(nsfwPill);

  // Find Schema pill
  const schemaPill = findElement(header, 'SPAN', (el) => el.textContent === 'Schema v2');
  assert.ok(schemaPill);
});

test('createDescription renders description', () => {
    const desc = "My Description";
    const section = createDescription(desc, utilsMock);

    assert.equal(section.tagName, 'SECTION');
    // Check title (from createSection mock)
    const h4 = findElement(section, 'H4');
    assert.equal(h4.textContent, 'Description');

    const p = findElement(section, 'P', (el) => el.textContent === desc);
    assert.ok(p);
});

test('createAudienceFlags renders flags', () => {
    const version = { isNsfw: true, isForKids: false };
    const section = createAudienceFlags(version, utilsMock);

    const nsfw = findElement(section, 'SPAN', (el) => el.textContent === 'Yes — marked NSFW');
    assert.ok(nsfw);

    const kids = findElement(section, 'SPAN', (el) => el.textContent === 'No — not marked for kids');
    assert.ok(kids);
});

test('createEventMetadata renders metadata', () => {
    const metadata = {
        kind: 21,
        summary: 'Summary Text',
        contentWarning: 'Warning',
        publishedAtSeconds: 1000,
        durationSeconds: 60,
        alt: 'Alt Text'
    };

    const section = createEventMetadata(metadata, utilsMock);

    // Kind
    const kindCode = findElement(section, 'CODE', (el) => el.textContent === 'kind 21');
    assert.ok(kindCode);

    // Summary
    const summary = findElement(section, 'P', (el) => el.textContent === 'Summary Text');
    assert.ok(summary);

    // Duration
    const duration = findElement(section, 'SPAN', (el) => el.textContent === 'DUR:60');
    assert.ok(duration);
});

test('createNotePointers renders pointers', () => {
    const version = {
        mode: 'live',
        videoRootId: 'root123',
        id: 'event123'
    };
    const dTag = 'd-tag-val';

    const section = createNotePointers(version, dTag, utilsMock);

    const dTagCode = findElement(section, 'CODE', (el) => el.textContent === 'd-tag-val');
    assert.ok(dTagCode);

    const rootCode = findElement(section, 'CODE', (el) => el.textContent === 'TRUNC:root123');
    assert.ok(rootCode);
});


// Helper to recursively find element
function findElement(root, tagName, predicate) {
    if (!root || !root.children) return null;

    if (root.tagName === tagName) {
        if (!predicate || predicate(root)) return root;
    }

    for (const child of root.children) {
        if (child.nodeType === 3) continue; // Skip text nodes
        if (child.nodeType === 11) { // Fragment
             const found = findElement(child, tagName, predicate);
             if (found) return found;
             continue;
        }

        const found = findElement(child, tagName, predicate);
        if (found) return found;
    }
    return null;
}
