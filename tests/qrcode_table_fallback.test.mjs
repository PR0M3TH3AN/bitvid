import { test } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

test('QR Code Table Fallback', async (t) => {
    // Setup JSDOM
    const dom = new JSDOM(`<!DOCTYPE html><body><div id="qrcode"></div></body>`);

    // Override globals to simulate browser environment provided by JSDOM
    // We need to override what setup-localstorage.mjs might have set
    global.window = dom.window;
    global.document = dom.window.document;
    global.HTMLStyleElement = dom.window.HTMLStyleElement;
    global.HTMLElement = dom.window.HTMLElement;

    // Copy other properties if needed, but these should be enough for qrcode.js

    // Ensure CanvasRenderingContext2D is NOT defined to trigger the table fallback
    if (global.CanvasRenderingContext2D) {
        delete global.CanvasRenderingContext2D;
    }
    if (global.window.CanvasRenderingContext2D) {
        delete global.window.CanvasRenderingContext2D;
    }

    // Dynamically import the module to ensure it uses the current environment
    const { createQrCode } = await import('../js/utils/qrcode.js');

    const el = global.document.getElementById('qrcode');

    // Create QR code
    createQrCode(el, { text: "test", width: 100, height: 100 });

    // Verify table is used (this confirms we hit the refactored code path)
    const table = el.querySelector('table');
    assert.ok(table, "Table should be created when canvas is not supported");
    assert.ok(table.classList.contains('qr-code__table'), "Table should have correct class");

    const rows = table.querySelectorAll('tr');
    assert.ok(rows.length > 0, "Should have rows");

    const cells = table.querySelectorAll('td');
    assert.ok(cells.length > 0, "Should have cells");
});
