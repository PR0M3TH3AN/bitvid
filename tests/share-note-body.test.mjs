// SCN-share-body: what the viewer actually reads in the composed note.
//
// Two shapes, chosen by whether a NIP-71 mirror was confirmed on relays:
//   mirror    -> quote card via `nostr:naddr1…`, NO bare thumbnail URL
//   no mirror -> bare thumbnail URL (described by the note's NIP-92 imeta)
//
// The "no bare thumbnail while quoting" rule is the one that matters visually:
// keeping both rendered the same image twice (once loose, once in the card).

import test from "node:test";
import assert from "node:assert/strict";
import { ShareNostrModal } from "../js/ui/components/ShareNostrModal.js";

// buildShareContent is a pure string builder; construct without touching the
// DOM-dependent parts of the modal.
const modal = Object.create(ShareNostrModal.prototype);
const build = (payload) => modal.buildShareContent(payload);

const BASE = {
  title: "Why I'm (sort of) not worried about AI",
  shareUrl: "https://bitvid.network/?v=nevent1abc",
  thumbnail: "https://cdn.example/thumb.jpg",
};

test("without a mirror the body ends with the thumbnail URL", () => {
  const body = build(BASE);
  assert.equal(
    body,
    "Why I'm (sort of) not worried about AI — Check out this video on bitvid 👇\n\n" +
      "https://bitvid.network/?v=nevent1abc\n\n" +
      "https://cdn.example/thumb.jpg"
  );
});

test("with a mirror the body quotes it and omits the thumbnail URL", () => {
  const body = build({ ...BASE, mirrorNaddr: "naddr1qqxnzd3e" });

  assert.match(body, /nostr:naddr1qqxnzd3e$/);
  assert.equal(
    body.includes("https://cdn.example/thumb.jpg"),
    false,
    "quote card already shows the thumbnail; a loose URL duplicates it"
  );
  // The bitvid link stays — attribution and traffic still matter.
  assert.match(body, /https:\/\/bitvid\.network\/\?v=nevent1abc/);
});

test("the quote reference uses the nostr: URI scheme clients resolve", () => {
  const body = build({ ...BASE, mirrorNaddr: "naddr1qqxnzd3e" });
  assert.equal(body.includes("nostr:naddr1qqxnzd3e"), true);
  // A bare naddr without the scheme is rendered as plain text by most clients.
  assert.equal(/(^|\s)naddr1qqxnzd3e/.test(body), false);
});

test("an empty or whitespace mirror pointer falls back to the thumbnail", () => {
  for (const mirrorNaddr of ["", "   ", null, undefined]) {
    const body = build({ ...BASE, mirrorNaddr });
    assert.match(body, /https:\/\/cdn\.example\/thumb\.jpg$/);
    assert.equal(body.includes("nostr:"), false);
  }
});

test("missing pieces never leave dangling blank sections", () => {
  const noThumb = build({ title: "T", shareUrl: "https://bitvid.network/?v=x" });
  assert.equal(noThumb.endsWith("\n"), false);
  assert.equal(/\n{3,}/.test(noThumb), false);

  const titleOnly = build({ title: "T" });
  assert.equal(titleOnly, "T — Check out this video on bitvid 👇");

  const empty = build({});
  assert.equal(empty, "Untitled video — Check out this video on bitvid 👇");
});

test("a missing title degrades to a placeholder rather than 'undefined'", () => {
  const body = build({ ...BASE, title: "   " });
  assert.match(body, /^Untitled video — /);
  assert.equal(body.includes("undefined"), false);
});
