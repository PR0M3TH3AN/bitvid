import { test, expect } from '@playwright/test';
import { startRelay } from '../../scripts/agent/simple-relay.mjs';
import { WebSocket } from 'ws';
import { finalizeEvent, getPublicKey, nip19 } from 'nostr-tools';

// Polyfill WebSocket for node environment
if (!global.WebSocket) {
    global.WebSocket = WebSocket;
}

const RELAY_PORT = 8899;
const RELAY_URL = `ws://127.0.0.1:${RELAY_PORT}`;

test.describe('Embed Player', () => {
  let relayServer;

  test.beforeAll(async () => {
    relayServer = startRelay(RELAY_PORT);
  });

  test.afterAll(async () => {
    if (relayServer) {
        await relayServer.close();
    }
  });

  test('reproduce embed resetStats error', async ({ page }) => {
    // 1. Create a dummy video event
    const sk = Uint8Array.from(Buffer.from('7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b', 'hex'));
    const pk = getPublicKey(sk);

    const event = finalizeEvent({
      kind: 30078,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['d', 'test-video'],
        ['title', 'Test Video'],
        ['url', 'https://example.com/video.mp4'],
      ],
      content: '',
      pubkey: pk,
    }, sk);

    // 2. Publish event to local relay
    await new Promise((resolve, reject) => {
        const ws = new WebSocket(RELAY_URL);
        ws.on('open', () => {
            ws.send(JSON.stringify(['EVENT', event]));
        });
        ws.on('message', (msg) => {
            const data = JSON.parse(msg.toString());
            if (data[0] === 'OK') {
                ws.close();
                resolve();
            }
        });
        ws.on('error', (e) => {
            reject(e);
        });
    });

    // 3. Construct nevent
    const nevent = nip19.neventEncode({
        id: event.id,
        relays: [RELAY_URL]
    });

    // 4. Navigate
    const consoleMessages = [];
    page.on('console', msg => consoleMessages.push(msg.text()));

    const errors = [];
    page.on('pageerror', err => {
        errors.push(err);
        console.log('PAGE ERROR:', err.message);
    });

    // Force local storage cleanup or setup if needed
    // The memory said: "Frontend verification scripts using Playwright must inject localStorage.setItem('hasSeenDisclaimer', 'true')"
    await page.addInitScript(() => {
        localStorage.setItem('hasSeenDisclaimer', 'true');
    });

    const embedUrl = `/embed.html?pointer=${nevent}&playback=url`;
    await page.goto(embedUrl);

    // 5. Wait for video attempt
    // We expect the status to change from "Loading video..."
    // If it crashes, it might not change, or it might change to "Resolving..." then crash.

    // We wait for a bit to let the async playback logic run
    try {
        await expect(page.locator('#embedStatus')).not.toHaveText('Loading video…', { timeout: 5000 });
        await expect(page.locator('#embedStatus')).not.toHaveText('Resolving video…', { timeout: 5000 });
    } catch (e) {
        console.log('Timeout waiting for status change. Current status:', await page.locator('#embedStatus').textContent());
    }

    // Check for the specific error
    const typeError = errors.find(e => e.message && e.message.includes('this.videoModal.resetStats is not a function'));
    if (typeError) {
        console.error('Reproduced TypeError:', typeError);
        // Fail the test
        expect(typeError).toBeUndefined();
    } else {
        console.log('No TypeError found.');
    }

    // Log console for debugging
    console.log('Console output:', consoleMessages.join('\n'));
  });
});
