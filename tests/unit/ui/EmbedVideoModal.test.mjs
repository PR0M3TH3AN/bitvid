import test from "node:test";
import assert from "node:assert/strict";

// Mock globals
if (!globalThis.window) {
    globalThis.window = {
        location: { origin: "http://localhost" },
        NostrTools: { nip19: { naddrEncode: () => "naddr...", neventEncode: () => "nevent..." } }
    };
}
if (!globalThis.document) {
    globalThis.document = {
        createElement: (tag) => {
            return {
                tagName: tag.toUpperCase(),
                innerHTML: "",
                firstChild: null,
                querySelector: () => null,
                classList: { add: () => {}, remove: () => {}, contains: () => false },
                addEventListener: () => {},
                setAttribute: () => {},
                appendChild: () => {},
                disabled: false,
                checked: false,
                value: ""
            };
        },
        createDocumentFragment: () => ({ appendChild: () => {} }),
        getElementById: () => null,
        body: { appendChild: () => {} },
        execCommand: () => {}
    };
}
if (!globalThis.navigator) {
    globalThis.navigator = {
        userAgent: "node",
    };
}
if (!globalThis.navigator.clipboard) {
    globalThis.navigator.clipboard = {
        writeText: async () => {},
    };
}

import { EmbedVideoModal } from "../../../js/ui/components/EmbedVideoModal.js";

test("EmbedVideoModal handleCopy uses navigator.clipboard", async (t) => {
    let clipboardText = "";
    const originalWriteText = globalThis.navigator.clipboard.writeText;
    globalThis.navigator.clipboard.writeText = async (text) => {
        clipboardText = text;
    };

    let successMsg = "";
    const callbacks = {
        showSuccess: (msg) => { successMsg = msg; },
        showError: () => {}
    };

    const modal = new EmbedVideoModal({ callbacks });
    modal.snippetTextarea = { value: "<iframe></iframe>", select: () => {}, setSelectionRange: () => {}, focus: () => {} };

    await modal.handleCopy();

    assert.equal(clipboardText, "<iframe></iframe>");
    assert.equal(successMsg, "Embed code copied to clipboard!");

    globalThis.navigator.clipboard.writeText = originalWriteText;
});

test("EmbedVideoModal handleCopy handles clipboard failure without execCommand", async (t) => {
    // Simulate clipboard failure
    const originalWriteText = globalThis.navigator.clipboard.writeText;
    globalThis.navigator.clipboard.writeText = async () => { throw new Error("Clipboard error"); };

    let errorMsg = "";
    const callbacks = {
        showSuccess: () => {},
        showError: (msg) => { errorMsg = msg; }
    };

    // Mock document.execCommand to track calls
    let execCommandCalled = false;
    const originalExecCommand = globalThis.document.execCommand;
    globalThis.document.execCommand = () => { execCommandCalled = true; return false; };

    const modal = new EmbedVideoModal({ callbacks });
    // Ensure modal uses our mocked document
    modal.document = globalThis.document;

    let selectCalled = false;
    modal.snippetTextarea = {
        value: "<iframe></iframe>",
        select: () => { selectCalled = true; },
        setSelectionRange: () => {},
        focus: () => {}
    };

    await modal.handleCopy();

    assert.equal(execCommandCalled, false, "execCommand should not be called");
    assert.equal(selectCalled, true, "Text should be selected for manual copy");
    assert.ok(errorMsg.toLowerCase().includes("manual"), "Error message should mention manual copy");

    // Restore
    globalThis.document.execCommand = originalExecCommand;
    globalThis.navigator.clipboard.writeText = originalWriteText;
});
