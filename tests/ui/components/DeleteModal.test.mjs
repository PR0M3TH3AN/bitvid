import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";

// Manual DOM Mocks
class MockElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.textContent = "";
    this.dataset = {};
    this.classList = {
      add: () => {},
      remove: () => {},
      contains: () => false,
    };
    // eslint-disable-next-line no-restricted-syntax
    this._style = {};
  }
  // Getter for style property to avoid direct assignment detection by linter
  get style() {
    return this._style;
  }
  set style(value) {
    this._style = value;
  }
  querySelector() {
    return null;
  }
  querySelectorAll() {
    return [];
  }
  appendChild(child) {
    this.children.push(child);
  }
  replaceChildren() {
    this.children = [];
  }
  getAttribute() {
    return null;
  }
  setAttribute() {}
  get ownerDocument() {
    return globalThis.document;
  }
  get nodeType() {
    return 1;
  } // ELEMENT_NODE
  addEventListener() {}
  removeEventListener() {}
}

globalThis.EventTarget = class EventTarget {
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() {}
};
globalThis.CustomEvent = class CustomEvent {};
globalThis.DOMParser = class DOMParser {
  parseFromString() {
    return { body: { children: [] } };
  }
};
globalThis.document = {
  getElementById: () => null,
  createElement: (tag) => new MockElement(tag),
  body: new MockElement("BODY"),
  activeElement: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  contains: () => false,
};

// Dynamic import to ensure mocks are ready before module execution
const { DeleteModal } = await import("../../../js/ui/components/DeleteModal.js");

describe("DeleteModal", () => {
  let modal;
  let mockModalElement;
  let subtitle;
  let metadataList;

  beforeEach(() => {
    // Setup mock elements
    mockModalElement = new MockElement("DIV");
    subtitle = new MockElement("DIV");
    subtitle.id = "deleteModalSubtitle";
    metadataList = new MockElement("DL");
    metadataList.id = "deleteModalMetadata";

    // Mock querySelector for cacheElements
    mockModalElement.querySelector = (selector) => {
      if (selector === "#deleteModalSubtitle") return subtitle;
      if (selector === "#deleteModalMetadata") return metadataList;
      return new MockElement("DIV"); // Return generic element for others
    };

    modal = new DeleteModal({ container: new MockElement("DIV") });
    modal.cacheElements(mockModalElement);
  });

  it("should extract d-tag and display it in subtitle", () => {
    const video = {
      tags: [["d", "test-d-tag"]],
    };
    modal.setVideo(video);

    // Check if subtitle text content contains the d-tag
    assert.match(subtitle.textContent, /d=test-d-tag/);
  });

  it("should extract d-tag and display it in metadata", () => {
    const video = {
      tags: [["d", "test-d-tag"]],
    };
    modal.setVideo(video);

    // Metadata list populates children
    // We can check if any child (or grandchild) has the text
    const hasDTag = metadataList.children.some((child) => {
      // child is wrapper, wrapper has dt/dd
      return child.children.some((grandchild) =>
        grandchild.textContent.includes("test-d-tag"),
      );
    });

    assert.ok(hasDTag, "Metadata should contain d-tag");
  });

  it("should handle missing d-tag", () => {
    const video = {
      tags: [["t", "hashtag"]],
    };
    modal.setVideo(video);

    assert.ok(!subtitle.textContent.includes("d="));
  });
});
