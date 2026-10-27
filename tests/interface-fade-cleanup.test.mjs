import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { initializeFadeInCleanup } from "../js/ui/fadeInCleanup.js";

function fixture(t) {
  const dom = new JSDOM('<!doctype html><body><main id="app" class="fade-in fade-in-delay-100 fade-in-delay-300 keep"></main></body>');
  const doc = dom.window.document;
  const app = doc.getElementById("app");
  const errors = [];
  dom.window.addEventListener("error", event => {
    errors.push(event.error); event.preventDefault();
  });
  const animations = [];
  const listeners = new Map();
  const add = doc.addEventListener.bind(doc), remove = doc.removeEventListener.bind(doc);
  doc.addEventListener = (type, fn, capture) => {
    if (type.startsWith("animation")) {
      assert.equal(capture, true, "cleanup must capture descendant events");
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    }
    add(type, fn, capture);
  };
  doc.removeEventListener = (type, fn, capture) => {
    listeners.get(type)?.delete(fn); remove(type, fn, capture);
  };
  doc.getAnimations = () => [...animations];
  function animation(target = app, playState = "finished", name = "interface-fade-in", pseudoElement = null) {
    const value = { animationName: name, playState, effect: { target, pseudoElement } };
    animations.push(value); return value;
  }
  function event(target = app, name = "interface-fade-in", type = "animationend", pseudoElement = "") {
    const value = new dom.window.Event(type, { bubbles: true });
    Object.assign(value, { animationName: name, pseudoElement });
    target.dispatchEvent(value);
  }
  function thumbnail(loaded = "true", marked = "true") {
    const el = doc.createElement("img");
    el.dataset.videoThumbnail = marked; el.dataset.thumbnailLoaded = loaded;
    doc.body.append(el); return el;
  }
  function cleaned(el = app) {
    assert.equal(el.classList.contains("fade-in"), false);
    assert.equal([...el.classList].some(x => x.startsWith("fade-in-delay-")), false);
    assert.equal(el.classList.contains("keep"), true);
  }
  function retained(el = app) {
    assert.equal(el.classList.contains("fade-in"), true);
    assert.equal(el.classList.contains("fade-in-delay-100"), true);
    assert.equal(el.classList.contains("fade-in-delay-300"), true);
  }
  t.after(() => {
    initializeFadeInCleanup(doc)(); dom.window.close();
    assert.deepEqual(errors, [], "cleanup events must not throw");
  });
  return { doc, app, animations, animation, event, thumbnail, cleaned, retained, listeners };
}

test("late initialization recovers finished entrance and all delay hooks", t => {
  const f = fixture(t); f.animation(); initializeFadeInCleanup(f.doc); f.cleaned();
});

for (const state of ["running", "paused", "idle"]) {
  test(`initialization preserves ${state} entrance until completion`, t => {
    const f = fixture(t); f.animation(f.app, state);
    initializeFadeInCleanup(f.doc); f.retained();
    f.event(); f.cleaned();
  });
}

test("finished older effect cannot remove a same-target active replacement", t => {
  const f = fixture(t); f.animation(); f.animation(f.app, "running");
  initializeFadeInCleanup(f.doc); f.retained();
  f.event(); f.cleaned();
});

test("unrelated finished animation preserves entrance hooks", t => {
  const f = fixture(t); f.animation(f.app, "finished", "spinner");
  initializeFadeInCleanup(f.doc); f.retained();
  f.event(f.app, "spinner"); f.retained();
});

test("pseudo-element finished effects and events do not clear the element", t => {
  const f = fixture(t); f.animation(f.app, "finished", "interface-fade-in", "::before");
  initializeFadeInCleanup(f.doc); f.retained();
  f.event(f.app, "interface-fade-in", "animationend", "::before"); f.retained();
});

test("finished child does not clear an ancestor with an active entrance", t => {
  const f = fixture(t); const child = f.doc.createElement("div");
  child.className = f.app.className; f.app.append(child);
  f.animation(f.app, "running"); f.animation(child);
  initializeFadeInCleanup(f.doc); f.retained(); f.cleaned(child);
});

test("future dynamically inserted entrance cleans on delegated end", t => {
  const f = fixture(t); initializeFadeInCleanup(f.doc);
  const later = f.doc.createElement("div"); later.className = f.app.className;
  f.doc.body.append(later); f.retained(later); f.event(later); f.cleaned(later);
});

test("active entrance cancellation cleans the same transient hooks", t => {
  const f = fixture(t); f.animation(f.app, "running"); initializeFadeInCleanup(f.doc);
  f.retained(); f.event(f.app, "interface-fade-in", "animationcancel"); f.cleaned();
});

test("thumbnail end and cancellation preserve existing loaded eligibility", t => {
  const f = fixture(t); initializeFadeInCleanup(f.doc);
  for (const type of ["animationend", "animationcancel"]) {
    const loaded = f.thumbnail(), pending = f.thumbnail("false"), unrelated = f.thumbnail("true", "false");
    for (const el of [loaded, pending, unrelated]) f.event(el, "video-thumbnail-fade-in", type);
    assert.equal(loaded.hasAttribute("data-thumbnail-loaded"), false);
    assert.equal(pending.dataset.thumbnailLoaded, "false");
    assert.equal(unrelated.dataset.thumbnailLoaded, "true");
  }
  f.retained();
});

test("interface completion preserves absent fade-in and unrelated delay classes", t => {
  const f = fixture(t); f.app.classList.remove("fade-in"); initializeFadeInCleanup(f.doc);
  f.event();
  assert.equal(f.app.className, "fade-in-delay-100 fade-in-delay-300 keep");
});

test("repeated initialization shares one capture listener pair and disposes idempotently", t => {
  const f = fixture(t); const first = initializeFadeInCleanup(f.doc);
  assert.equal(initializeFadeInCleanup(f.doc), first);
  assert.equal(f.listeners.get("animationend").size, 1);
  assert.equal(f.listeners.get("animationcancel").size, 1);
  first(); first();
  assert.equal(f.listeners.get("animationend").size, 0);
  assert.equal(f.listeners.get("animationcancel").size, 0);
  f.event(); f.retained();
  const next = initializeFadeInCleanup(f.doc); assert.notEqual(next, first);
  first(); // A stale disposer must not erase the current registration.
  assert.equal(initializeFadeInCleanup(f.doc), next);
  f.event(); f.cleaned();
});

test("missing animation inspection retains event cleanup without guessing completion", t => {
  const f = fixture(t); delete f.doc.getAnimations;
  initializeFadeInCleanup(f.doc); f.retained(); f.event(); f.cleaned();
});

test("reduced-motion no-animation initialization preserves hooks and thumbnail eligibility", t => {
  const f = fixture(t); const img = f.thumbnail();
  f.doc.defaultView.matchMedia = query => ({ matches: query === "(prefers-reduced-motion: reduce)" });
  initializeFadeInCleanup(f.doc); f.retained();
  assert.equal(img.dataset.thumbnailLoaded, "true");
  assert.equal(f.animations.length, 0);
});

test("non-element animation events do not interrupt future cleanup", t => {
  const f = fixture(t); initializeFadeInCleanup(f.doc);
  f.event(f.doc); f.retained(); f.event(); f.cleaned();
});

test("real index cleanup wiring recovers a fade whose end preceded bootstrap evaluation", async t => {
  const f = fixture(t); f.animation();
  f.event(); f.retained(); // End occurred before production registration.
  const index = await readFile(new URL("../js/index.js", import.meta.url), "utf8");
  const imported = index.match(/import\s*\{\s*(\w+)\s*\}\s*from\s*["'](.+fadeInCleanup\.js)["'];/);
  assert.ok(imported, "index must import the cleanup initializer");
  const actual = await import(new URL(imported[2], new URL("../js/index.js", import.meta.url)));
  const start = index.indexOf("// Centralized animation cleanup");
  const end = index.indexOf("// 1) Load modals", start);
  assert.ok(start >= 0 && end > start, "execute actual isolated bootstrap cleanup section");
  const cleanupSection = index.slice(start, end);
  // Real bootstrap statements and the real exported initializer; other app IO
  // is outside this focused wiring scenario, not replaced by a pretend boot.
  new Function("document", imported[1], cleanupSection)(f.doc, actual[imported[1]]);
  f.cleaned();
  const future = f.doc.createElement("div"); future.className = "fade-in fade-in-delay-100 keep";
  f.doc.body.append(future); f.event(future); f.cleaned(future);
});
