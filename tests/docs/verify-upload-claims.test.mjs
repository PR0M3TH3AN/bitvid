import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const DOC_PATH = 'content/docs/guides/upload-content.md';
const HTML_PATH = 'components/upload-modal.html';

describe('Documentation Accuracy Verification', () => {
  let docContent;
  let htmlContent;

  test('setup', async () => {
    docContent = await fs.readFile(DOC_PATH, 'utf8');
    htmlContent = await fs.readFile(HTML_PATH, 'utf8');
  });

  it('should list accepted video file extensions in docs matching the HTML accept attribute', () => {
    // Extract extensions from HTML
    // accept="video/*,.m3u8,.ts,.mp4,.webm,.mov,.mkv,.mpg,.mpeg"
    const htmlMatch = htmlContent.match(/accept="([^"]*)"/);
    assert.ok(htmlMatch, 'Upload modal should have an accept attribute');

    const htmlAccepts = htmlMatch[1].split(',')
      .map(s => s.trim())
      .filter(s => s.startsWith('.')) // Only care about extensions
      .map(s => s.toLowerCase());

    // Extract extensions from Docs
    // - **Video:** `.mp4`, `.webm`, `.mov`, `.mkv`, `.ts`, `.m3u8`, `.mpg`, `.mpeg`
    const docMatch = docContent.match(/- \*\*Video:\*\* (.*)/);
    assert.ok(docMatch, 'Docs should list video types');

    const docAccepts = docMatch[1].match(/\.(\w+)/g)
      .map(s => s.toLowerCase());

    // Check if every HTML extension is in Docs
    for (const ext of htmlAccepts) {
      assert.ok(docAccepts.includes(ext), `Extension ${ext} from HTML not found in Docs`);
    }

    // Check if every Doc extension is in HTML (ignoring sort order)
    for (const ext of docAccepts) {
      assert.ok(htmlAccepts.includes(ext), `Extension ${ext} from Docs not found in HTML`);
    }
  });

  it('should state Title is required in docs and be required in HTML', () => {
    // Docs: - **Title:** **Required**.
    assert.match(docContent, /- \*\*Title:\*\* \*\*Required\*\*/i, 'Docs should state Title is required');

    // HTML: <input id="input-title" ... required ... />
    // Simple check for id and required in close proximity or regex
    const titleInputMatch = htmlContent.match(/<input[^>]*id="input-title"[^>]*>/);
    assert.ok(titleInputMatch, 'Title input not found in HTML');
    assert.match(titleInputMatch[0], /required/, 'Title input in HTML should have "required" attribute');
  });

  it('should mention 2GB limit recommendation in docs and HTML', () => {
    // Docs: Up to **2GB** per file
    assert.match(docContent, /2GB/i, 'Docs should mention 2GB limit');

    // HTML: (Max 2GB recommended)
    assert.match(htmlContent, /2GB recommended/i, 'HTML should mention 2GB recommended limit');
  });
});
