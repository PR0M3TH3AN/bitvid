import { test, describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";

describe("DeleteModal", () => {
    let DeleteModal;
    let modal;
    let mockModalElement;
    let subtitle;
    let metadataList;

    beforeEach(async () => {
        const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
            url: "http://localhost/",
        });
        globalThis.document = dom.window.document;
        globalThis.window = dom.window;
        globalThis.HTMLElement = dom.window.HTMLElement;
        globalThis.EventTarget = dom.window.EventTarget;
        globalThis.Node = dom.window.Node;
        globalThis.DOMParser = dom.window.DOMParser;
        globalThis.Event = dom.window.Event;
        globalThis.CustomEvent = dom.window.CustomEvent;

        // Dynamic import to ensure globals are set before module execution
        const module = await import("../../../js/ui/components/DeleteModal.js");
        DeleteModal = module.DeleteModal;

        // Mock DOM elements
        mockModalElement = document.createElement('div');
        subtitle = document.createElement('div');
        subtitle.id = "deleteModalSubtitle";
        metadataList = document.createElement('dl');
        metadataList.id = "deleteModalMetadata";

        mockModalElement.appendChild(subtitle);
        mockModalElement.appendChild(metadataList);

        modal = new DeleteModal();
        modal.cacheElements(mockModalElement);
    });

    it("should extract d-tag and display it in subtitle", () => {
        const video = {
            tags: [['d', 'my-d-tag']]
        };
        modal.setVideo(video);

        assert.ok(subtitle.textContent.includes("d=my-d-tag"), `Subtitle should contain d-tag, got: ${subtitle.textContent}`);
    });

    it("should extract d-tag and display it in metadata", () => {
        const video = {
            tags: [['d', 'my-d-tag']]
        };
        modal.setVideo(video);

        const metadataText = metadataList.textContent;
        assert.ok(metadataText.includes("my-d-tag"), `Metadata should contain d-tag, got: ${metadataText}`);
    });

     it("should handle missing d-tag", () => {
        const video = {
            tags: [['t', 'hashtag']]
        };
        modal.setVideo(video);

        assert.ok(!subtitle.textContent.includes("d="), `Subtitle should not contain d-tag, got: ${subtitle.textContent}`);
    });
});
