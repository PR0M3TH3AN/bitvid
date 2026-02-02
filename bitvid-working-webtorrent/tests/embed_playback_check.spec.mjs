import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { startRelay } from '../scripts/agent/simple-relay.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../');

async function runRepro() {
  console.log('Starting reproduction script...');

  const relayPort = 8899;
  const relayUrl = `ws://localhost:${relayPort}`;
  console.log(`Starting local relay on port ${relayPort}...`);
  const relay = startRelay(relayPort);

  const serverPort = 8099;
  console.log(`Starting web server on port ${serverPort}...`);
  const serverProcess = spawn('npx', ['serve', '-p', String(serverPort)], {
    cwd: ROOT_DIR,
    stdio: 'ignore',
    shell: true
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  let browser;
  let errorFound = false;

  try {
    console.log('Launching headless browser...');
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    page.on('console', msg => {
      console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`);
      if (msg.text().includes('this.videoModal.resetStats is not a function')) {
        console.log('!!! CAUGHT EXPECTED ERROR IN CONSOLE !!!');
        errorFound = true;
      }
    });

    page.on('pageerror', err => {
      console.log(`[BROWSER PAGEERROR] ${err.message}`);
      if (err.message.includes('this.videoModal.resetStats is not a function')) {
        console.log('!!! CAUGHT EXPECTED ERROR IN PAGEERROR !!!');
        errorFound = true;
      }
    });

    const baseUrl = `http://localhost:${serverPort}`;
    console.log(`Navigating to ${baseUrl} to setup...`);

    await page.goto(`${baseUrl}/index.html`);
    await page.waitForFunction(() => window.NostrTools);

    const eventId = await page.evaluate(async (relayUrl) => {
        const { nostrClient } = await import('./js/nostrClientFacade.js');
        const { generateSecretKey, getPublicKey } = window.NostrTools;
        const { bytesToHex } = window.NostrTools.utils || window.NostrTools;

        const sk = generateSecretKey();
        const privateKey = typeof sk === 'string' ? sk : bytesToHex(sk);
        const pubkey = getPublicKey(sk);

        nostrClient.relays = [relayUrl];
        nostrClient.readRelays = [relayUrl];
        nostrClient.writeRelays = [relayUrl];
        await nostrClient.init();
        await nostrClient.registerPrivateKeySigner({ privateKey, pubkey });

        const videoPayload = {
            legacyFormData: {
                title: 'Repro Video',
                description: 'Repro description',
                url: 'https://example.com/video.mp4',
                mimeType: 'video/mp4',
            }
        };

        const event = await nostrClient.publishVideo(videoPayload, pubkey);
        return event.id;
    }, relayUrl);

    console.log(`Published video event: ${eventId}`);

    const nevent = await page.evaluate(({ id, relayUrl }) => {
        return window.NostrTools.nip19.neventEncode({
            id,
            relays: [relayUrl]
        });
    }, { id: eventId, relayUrl });

    const embedUrl = `${baseUrl}/embed?pointer=${nevent}&playback=url`;
    console.log(`Navigating to embed: ${embedUrl}`);

    const response = await page.goto(embedUrl);
    console.log(`Response status: ${response.status()} ${response.statusText()}`);
    console.log(`Response url: ${response.url()}`);

    const locationHref = await page.evaluate(() => window.location.href);
    console.log(`Current Location: ${locationHref}`);

    console.log('Waiting for error...');
    await page.waitForTimeout(10000);

    const statusText = await page.evaluate(() => {
        return document.getElementById('embedStatus')?.textContent;
    });
    console.log(`Current Embed Status: "${statusText}"`);

    if (errorFound) {
        console.error('FAILURE: TypeError still present.');
    } else {
        console.log('SUCCESS: TypeError fixed (not found).');
    }

  } catch (err) {
    console.error('Test script error:', err);
  } finally {
    if (browser) await browser.close();
    serverProcess.kill();
    relay.close();

    if (errorFound) {
        process.exit(1);
    }
  }
}

runRepro();
