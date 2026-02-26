import { test, describe } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

describe('QRCode Table Fallback', () => {
  test('should generate table when Canvas is not supported', async () => {
    const dom = new JSDOM(`<!DOCTYPE html><body><div id="qrcode"></div></body>`);

    // Set up global environment for the library
    global.document = dom.window.document;
    global.window = dom.window;
    global.HTMLStyleElement = dom.window.HTMLStyleElement;
    global.HTMLElement = dom.window.HTMLElement;
    global.WeakMap = dom.window.WeakMap || global.WeakMap;
    global.Map = dom.window.Map || global.Map;

    // Ensure CanvasRenderingContext2D is NOT defined to trigger table fallback
    delete global.CanvasRenderingContext2D;
    delete global.window.CanvasRenderingContext2D;

    // Ensure we are not in SVG mode (JSDOM default is HTML)

    // Import the module dynamically
    const { createQrCode } = await import('../js/utils/qrcode.js');

    const el = global.document.getElementById('qrcode');

    // Create QR code
    createQrCode(el, { text: "test", width: 100, height: 100 });

    // Verify table is used
    const table = el.querySelector('table');
    assert.ok(table, "Table element should be created");
    assert.ok(table.classList.contains('qr-code__table'), "Table should have correct class");

    // Check for table structure
    const rows = table.querySelectorAll('tr');
    assert.ok(rows.length > 0, "Should have rows");

    const cells = table.querySelectorAll('td');
    assert.ok(cells.length > 0, "Should have cells");
  });
});
