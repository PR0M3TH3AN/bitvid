# **bitvid: Enhanced Migration of Note Spec Logic**

---

## Overview

Currently, logic related to the **video note specification** and how data is structured (version, `isPrivate`, encryption placeholders, and so on) is scattered across three files:

1. **app.js**: Contains UI handling, form submissions, and some note structure (like `version`, `title`, `magnet`).
2. **nostr.js**: Builds and edits Nostr events (`publishVideo`, `editVideo`, `deleteVideo`). It also holds methods for “fake encryption” and “fake decryption,” among other utilities.
3. **webtorrent.js**: Mostly focuses on torrent streaming but does not handle note logic directly. It rarely touches the note data, so it may not need major restructuring.

To isolate note-spec-related operations, you can create a new file (for example, `bitvidNoteSpec.js`). This file will have all the code that deals with creating or parsing your event content fields (version, magnet link encryption, etc.). Then `app.js` and `nostr.js` can import those functions.

---

## Goals

- **Centralize the note specification**: Keep details like `version`, `deleted`, `isPrivate`, encryption, and decryption in one place.
- **Simplify `app.js`**: Move form building/parsing to new spec-related functions. That way, `app.js` only handles UI and user actions.
- **Streamline `nostr.js`**: Shift event creation logic into a function from the new note spec file. Nostr code then just calls that function, signs it, and publishes it.

---

## Proposed File: `bitvidNoteSpec.js`

This new file could export:

1. **Constants / Defaults** (for example, default `kind=30078`, default `version=2`, etc.).
2. **Helper Functions**:
   - `buildNewNote(data, pubkey)`: Takes basic form data and returns a fully structured Nostr note (an object) ready to be signed.
   - `buildEditNote(originalEvent, updatedData)`: Merges old note content with new fields.
   - `softDeleteNote(originalEvent)`: Constructs a note with `deleted = true`.
   - `encryptMagnet(magnet)`, `decryptMagnet(magnet)`: Legacy pass-through helpers kept in case encryption returns; private listings now hide rather than encrypt.
   - `validateNoteContent(content)`: Ensures essential fields (title, magnet, mode, etc.) are present and valid.

Because you’re not implementing Version 3 yet, keep your existing version logic. If you do plan to adopt Version 3 later, the new file is where you’d add or change fields without scattering edits across multiple files.

---

### 1. Extracting Logic from `app.js`

In `app.js`, you have code in the `handleSubmit` method that constructs a `formData` object with fields like `version`, `title`, `magnet`, and so on. You can:

- Remove direct references to `version` or encryption from `handleSubmit`.
- Instead, pass the raw form input to a function in `bitvidNoteSpec.js` named, for instance, `prepareNewNote(formInput, pubkey)`.

Example:

```js
// bitvidNoteSpec.js (simplified example)
export function prepareNewNote(formInput, pubkey) {
  // Combine user inputs with defaults
  const isPrivate = formInput.isPrivate === true;
  const finalMagnet = isPrivate
    ? encryptMagnet(formInput.magnet) // currently a pass-through; hiding happens at the feed layer
    : formInput.magnet;

  return {
    kind: 30078,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["t", "video"],
      ["d", generateUniqueDTag()]
    ],
    content: JSON.stringify({
      version: formInput.version ?? 2,
      deleted: false,
      isPrivate,
      title: formInput.title,
      magnet: finalMagnet,
      thumbnail: formInput.thumbnail,
      description: formInput.description,
      mode: formInput.mode
    })
  };
}

// app.js (handleSubmit excerpt)
import { prepareNewNote } from "./bitvidNoteSpec.js";

async handleSubmit(e) {
  e.preventDefault();

  if (!this.pubkey) {
    this.showError("Please login to post a video.");
    return;
  }

  const formInput = {
    version: 2,
    title: document.getElementById("title")?.value.trim() || "",
    magnet: document.getElementById("magnet")?.value.trim() || "",
    thumbnail: document.getElementById("thumbnail")?.value.trim() || "",
    description: document.getElementById("description")?.value.trim() || "",
    mode:
      (document.getElementById("mode")?.value || "")
        .trim()
        .toLowerCase() === "dev"
        ? "dev"
        : "live",
    isPrivate: this.isPrivateCheckbox.checked
  };

  try {
    const eventToPublish = prepareNewNote(formInput, this.pubkey);
    await nostrClient.publishNote(eventToPublish);
    this.submitForm.reset();
    ...
  } catch (err) {
    ...
  }
}
```

Now `handleSubmit` is only handling the UI, while actual note-building moves to `bitvidNoteSpec.js`.

---

### 2. Extracting Logic from `nostr.js`

In `nostr.js`, you have methods like `publishVideo`, `editVideo`, and `deleteVideo`. They build the note content, sign it, and publish it. You can simplify them:

- **Rename** them to something more generic (e.g., `publishNote`, `updateNote`, `deleteNote`) if that aligns better with Nostr usage.
- **Import** helper functions from `bitvidNoteSpec.js` to build or edit the actual content. That way, `nostr.js` doesn’t need to know about `version`, `deleted`, or encryption details.

For example, you might do this:

```js
// nostr.js
import { buildEditNote, buildDeleteNote } from "./bitvidNoteSpec.js";

class NostrClient {
  ...
  async editVideo(originalEvent, updatedData, pubkey) {
    // 1) Build the note object using shared function
    const eventToPublish = buildEditNote(originalEvent, updatedData);

    // 2) Sign and publish
    const signedEvent = await window.nostr.signEvent(eventToPublish);
    ...
  }

  async deleteVideo(originalEvent, pubkey) {
    const eventToPublish = buildDeleteNote(originalEvent);
    const signedEvent = await window.nostr.signEvent(eventToPublish);
    ...
  }
}
```

By delegating the actual note-building to `buildEditNote` and `buildDeleteNote`, you keep `nostr.js` focused on signing and relaying events.

---

### 3. Minimal Impact on `webtorrent.js`

`webtorrent.js` deals mostly with streaming and service workers. It does not appear to handle note building or encryption. You likely do not need to change anything there for this refactor, unless you want to move `fakeDecrypt` references. If you do, just import the spec’s encryption/decryption functions where needed.

---

## Step-by-Step Migration Plan

1. **Create `bitvidNoteSpec.js`:**  
   - Place all code that deals with constructing, editing, or deleting your media note events.  
   - Include minimal encryption/decryption functions if they are purely for magnet links.

2. **Update `app.js`:**  
   - Remove direct references to building the final note object in `handleSubmit`.  
   - Instead, gather user inputs, call a helper function from `bitvidNoteSpec.js` to produce the final note object, then pass that object to `nostrClient.publishNote` (or a similar method).

3. **Update `nostr.js`:**  
   - Rename or refactor `publishVideo`, `editVideo`, and `deleteVideo` to call your new helper methods from `bitvidNoteSpec.js`.  
   - Keep the Nostr signing and publishing logic inside `nostr.js`.

4. **Verify Data Flow:**  
   - Confirm that after form submission, the final event object is built in `bitvidNoteSpec.js`, returned to `app.js`, and forwarded to `nostrClient`.  
   - Ensure you can still subscribe to events and parse them without issues.

5. **Remove Redundant Code:**  
   - Delete any leftover duplication in `app.js` or `nostr.js` relating to magnet encryption or note structuring.

6. **Test Thoroughly:**  
   - Create, edit, and delete events to ensure everything behaves the same.  
   - Confirm that private videos stay hidden from shared grids as expected.

---

## Example File Outline for `bitvidNoteSpec.js`

Below is a small outline showing how you might organize the new file. The actual details will depend on your existing code and future needs:

```js
// bitvidNoteSpec.js

// Legacy placeholder kept for future encryption experiments (currently returns the raw magnet)
export function encryptMagnet(magnet) {
  return magnet; // private cards are hidden instead of encrypted
}

export function decryptMagnet(magnet) {
  return magnet; // private cards are hidden instead of encrypted
}

function generateUniqueDTag() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Build a brand-new note
export function prepareNewNote(formInput, pubkey) {
  const isPrivate = formInput.isPrivate === true;
  const finalMagnet = isPrivate
    ? encryptMagnet(formInput.magnet) // currently a pass-through; hiding happens at the feed layer
    : formInput.magnet;

  return {
    kind: 30078,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["t", "video"],
      ["d", generateUniqueDTag()]
    ],
    content: JSON.stringify({
      version: formInput.version ?? 2,
      deleted: false,
      isPrivate,
      title: formInput.title,
      magnet: finalMagnet,
      thumbnail: formInput.thumbnail,
      description: formInput.description,
      mode: formInput.mode ?? "live"
    })
  };
}

// Build an edited note using original event data
export function buildEditNote(originalEvent, updatedData) {
  // parse old content
  // combine with new fields
  // handle legacy visibility toggles / future encryption experiments
  // return the final event object
}

// Build a deleted note
export function buildDeleteNote(originalEvent) {
  // parse old content
  // set deleted=true, remove magnet, etc.
  // return the final event object
}

// Validate content structure
export function isValidNoteContent(content) {
  // check for required fields
  return true;
}
```

By keeping these details in a single file, you won’t have to search through `app.js` or `nostr.js` whenever you need to tweak the note structure.

---

## Conclusion

Shifting all note spec logic into a dedicated file will make your codebase cleaner and set you up for easier upgrades down the road. You can proceed with the steps above, ensuring you keep each file (UI, Nostr communication, torrent streaming) focused on its primary role. Once done, you’ll be able to implement higher-level changes (like Version 3 or additional content fields) in one place without sifting through unrelated code.