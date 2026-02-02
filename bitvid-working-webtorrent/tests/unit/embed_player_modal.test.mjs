import { test } from 'node:test';
import assert from 'node:assert';
import { EmbedPlayerModal } from '../../js/ui/components/EmbedPlayerModal.js';

// Polyfill EventTarget for Node < 16 if needed, but likely available
if (typeof EventTarget === 'undefined') {
    global.EventTarget = class EventTarget {
        constructor() { this.listeners = {}; }
        addEventListener() {}
        removeEventListener() {}
        dispatchEvent() { return true; }
    };
}

test('EmbedPlayerModal interface', async (t) => {
    const modal = new EmbedPlayerModal();

    await t.test('has expected methods', () => {
        assert.strictEqual(typeof modal.load, 'function');
        assert.strictEqual(typeof modal.getRoot, 'function');
        assert.strictEqual(typeof modal.getVideoElement, 'function');
        assert.strictEqual(typeof modal.setVideoElement, 'function');
        assert.strictEqual(typeof modal.resetStats, 'function');
        assert.strictEqual(typeof modal.updateStatus, 'function');
        assert.strictEqual(typeof modal.setTorrentStatsVisibility, 'function');
        assert.strictEqual(typeof modal.addEventListener, 'function');
        assert.strictEqual(typeof modal.removeEventListener, 'function');
        assert.strictEqual(typeof modal.dispatch, 'function');
    });

    await t.test('resetStats is no-op and does not throw', () => {
        assert.doesNotThrow(() => modal.resetStats());
    });
});
