// HLS (.m3u8) support — see js/services/hlsPlayback.js.
//
// Scenario spec (SCN-hls-*): bitvid used to attach every hosted source with
// `videoEl.src = url`, which only plays HLS on Safari. Nostr clients publishing
// bitvid's v3 schema with HLS ladders (nostube/slidestr) were unplayable on
// Chrome/Firefox, and the URL-health probe reported every healthy HLS stream as
// offline. These tests pin the observable decisions at those boundaries:
// detection, engine selection, teardown, and the manifest probe.
//
// The hls.js engine itself is never loaded here — the tests exercise the
// native-HLS branch and the fetch-based manifest probe, which are the two paths
// that do not require a real MediaSource implementation.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HLS_MIME_TYPES,
  attachHlsSource,
  detachHls,
  getAttachedHls,
  isHlsMimeType,
  isHlsSource,
  isHlsUrl,
  prefersNativeHls,
  probeHlsManifest,
  supportsMse,
  supportsNativeHls,
} from "../../js/services/hlsPlayback.js";

// --- SCN-hls-detect -------------------------------------------------------
// Given a hosted URL, when its path ends in .m3u8, then it is treated as HLS —
// regardless of query strings (signed CDN URLs) or fragments.

test("isHlsUrl matches .m3u8 paths, including with query/fragment", () => {
  assert.equal(
    isHlsUrl(
      "https://almond.apps2.slidestr.net/3751b84f27234fc8ce3227d132b422f7e00f4a50c6cdc322080fed89a302d7dd.m3u8"
    ),
    true
  );
  assert.equal(isHlsUrl("https://cdn.example/v.M3U8"), true);
  assert.equal(isHlsUrl("https://cdn.example/v.m3u8?token=abc&exp=1"), true);
  assert.equal(isHlsUrl("https://cdn.example/v.m3u8#t=10"), true);
  assert.equal(isHlsUrl("  https://cdn.example/v.m3u8  "), true);
});

test("isHlsUrl rejects non-playlist URLs and incidental .m3u8 substrings", () => {
  assert.equal(isHlsUrl("https://cdn.example/v.mp4"), false);
  assert.equal(isHlsUrl("https://cdn.example/v.webm"), false);
  // .m3u8 must terminate the PATH, not merely appear somewhere in the URL.
  assert.equal(isHlsUrl("https://cdn.example/v.m3u8.mp4"), false);
  assert.equal(isHlsUrl("https://cdn.example/?next=/a.m3u8"), false);
  assert.equal(isHlsUrl(""), false);
  assert.equal(isHlsUrl(null), false);
  assert.equal(isHlsUrl(undefined), false);
  assert.equal(isHlsUrl(42), false);
});

test("isHlsMimeType covers the canonical and legacy playlist types", () => {
  for (const type of HLS_MIME_TYPES) {
    assert.equal(isHlsMimeType(type), true, `${type} should be HLS`);
    assert.equal(isHlsMimeType(type.toUpperCase()), true);
  }
  // Parameters must not defeat the match (servers append charset).
  assert.equal(isHlsMimeType("application/vnd.apple.mpegurl; charset=utf-8"), true);
  assert.equal(isHlsMimeType("video/mp4"), false);
  assert.equal(isHlsMimeType("text/plain"), false);
  assert.equal(isHlsMimeType(""), false);
  assert.equal(isHlsMimeType(null), false);
});

test("isHlsSource accepts either the URL or an imeta mime hint", () => {
  assert.equal(isHlsSource({ url: "https://cdn.example/v.m3u8" }), true);
  assert.equal(
    isHlsSource({ url: "https://cdn.example/stream", mimeType: "application/vnd.apple.mpegurl" }),
    true
  );
  assert.equal(isHlsSource({ url: "https://cdn.example/v.mp4" }), false);
  assert.equal(isHlsSource({}), false);
  assert.equal(isHlsSource(), false);
});

// --- SCN-hls-engine-choice ------------------------------------------------
// Given a browser that CLAIMS native HLS support via canPlayType, when MSE is
// also available, then hls.js must win. This is not a preference — it is a
// correctness requirement measured in real browsers:
//
//   Firefox 146:  canPlayType("application/vnd.apple.mpegurl") === ""
//                 bare <video> → MEDIA_ERR_SRC_NOT_SUPPORTED (code 4)
//   Chrome  149:  canPlayType(...) === "maybe"  ← and it is genuinely true there
//
// canPlayType is only ever a hint, so the engine choice keys off MSE (what
// hls.js actually needs) and falls back to native only when MSE is absent.

const makeFakeVideo = (canPlayTypeResult = "") => ({
  src: "",
  canPlayType: () => canPlayTypeResult,
});

// Node has no MediaSource; install/remove a fake to drive supportsMse().
const withMediaSource = async (isTypeSupported, fn) => {
  const had = "MediaSource" in globalThis;
  const original = globalThis.MediaSource;
  globalThis.MediaSource = { isTypeSupported };
  try {
    return await fn();
  } finally {
    if (had) {
      globalThis.MediaSource = original;
    } else {
      delete globalThis.MediaSource;
    }
  }
};

test("supportsNativeHls reflects canPlayType for the playlist types", () => {
  assert.equal(supportsNativeHls(makeFakeVideo("maybe")), true);
  assert.equal(supportsNativeHls(makeFakeVideo("probably")), true);
  assert.equal(supportsNativeHls(makeFakeVideo("")), false);
});

test("supportsNativeHls survives a throwing canPlayType", () => {
  const hostile = {
    canPlayType() {
      throw new Error("nope");
    },
  };
  assert.equal(supportsNativeHls(hostile), false);
});

test("supportsMse tracks MediaSource.isTypeSupported", async () => {
  assert.equal(supportsMse(), false, "no MediaSource in this environment");
  await withMediaSource(() => true, () => {
    assert.equal(supportsMse(), true);
  });
  await withMediaSource(() => false, () => {
    assert.equal(supportsMse(), false);
  });
  await withMediaSource(() => {
    throw new Error("boom");
  }, () => {
    assert.equal(supportsMse(), false, "a throwing check must not propagate");
  });
});

test("prefersNativeHls is false whenever MSE can back hls.js", async () => {
  const chromeLike = makeFakeVideo("maybe");
  await withMediaSource(() => true, () => {
    // Chrome's canPlayType says "maybe" — hls.js must still win.
    assert.equal(prefersNativeHls(chromeLike), false);
  });
  // Only with MSE genuinely gone does native become the choice.
  assert.equal(prefersNativeHls(chromeLike), true);
  assert.equal(prefersNativeHls(makeFakeVideo("")), false, "neither path works");
});

test("attachHlsSource prefers hls.js over a native claim when MSE exists", async () => {
  const video = makeFakeVideo("maybe");
  const { engine, instances } = makeFakeEngine();
  const handle = await withMediaSource(() => true, () =>
    attachHlsSource(video, "https://cdn.example/v.m3u8", {
      createEngine: async () => engine,
    })
  );
  assert.equal(handle.mode, "mse");
  assert.equal(video.src, "", "must not use the native src path");
  assert.equal(instances.length, 1);
});

test("attachHlsSource uses native playback when MSE is unavailable", async () => {
  const video = makeFakeVideo("maybe");
  const handle = await attachHlsSource(video, "https://cdn.example/v.m3u8");
  assert.ok(handle, "expected a handle");
  assert.equal(handle.mode, "native");
  assert.equal(video.src, "https://cdn.example/v.m3u8");
  // Nothing to destroy on the native path, but destroy() must stay callable.
  assert.doesNotThrow(() => handle.destroy());
  assert.equal(getAttachedHls(video), null);
});

test("attachHlsSource falls back to native when the engine fails to load", async () => {
  const video = makeFakeVideo("maybe");
  const handle = await withMediaSource(() => true, () =>
    attachHlsSource(video, "https://cdn.example/v.m3u8", {
      createEngine: async () => null,
    })
  );
  assert.equal(handle.mode, "native", "an attempt beats a guaranteed failure");
  assert.equal(video.src, "https://cdn.example/v.m3u8");
});

test("attachHlsSource trims the URL before assigning it", async () => {
  const video = makeFakeVideo("maybe");
  await attachHlsSource(video, "  https://cdn.example/v.m3u8\n");
  assert.equal(video.src, "https://cdn.example/v.m3u8");
});

test("attachHlsSource returns null for missing element or URL", async () => {
  assert.equal(await attachHlsSource(null, "https://cdn.example/v.m3u8"), null);
  assert.equal(await attachHlsSource(makeFakeVideo("maybe"), ""), null);
  assert.equal(await attachHlsSource(makeFakeVideo("maybe"), null), null);
});

// --- MSE test double ------------------------------------------------------
// A minimal stand-in for the hls.js constructor: enough surface for the
// attach/teardown/error contract, with hooks to drive events deterministically.
// `autoManifest` mirrors real hls.js, which parses the manifest asynchronously
// after loadSource(); tests that drive errors turn it off.

const HLS_EVENTS = {
  MANIFEST_PARSED: "hlsManifestParsed",
  ERROR: "hlsError",
};
const HLS_ERROR_TYPES = {
  NETWORK_ERROR: "networkError",
  MEDIA_ERROR: "mediaError",
  OTHER_ERROR: "otherError",
};

function makeFakeEngine({ autoManifest = true, levels = [{ height: 240 }] } = {}) {
  const instances = [];

  class FakeHls {
    static isSupported() {
      return true;
    }
    static get Events() {
      return HLS_EVENTS;
    }
    static get ErrorTypes() {
      return HLS_ERROR_TYPES;
    }

    constructor(config) {
      this.config = config;
      this.handlers = new Map();
      this.destroyCalls = 0;
      this.startLoadCalls = 0;
      this.recoverMediaErrorCalls = 0;
      this.swapAudioCodecCalls = 0;
      this.attachedMedia = null;
      this.loadedSource = null;
      instances.push(this);
    }

    on(event, handler) {
      if (!this.handlers.has(event)) {
        this.handlers.set(event, []);
      }
      this.handlers.get(event).push(handler);
    }

    emit(event, data) {
      for (const handler of this.handlers.get(event) || []) {
        handler(event, data);
      }
    }

    attachMedia(media) {
      this.attachedMedia = media;
    }

    loadSource(url) {
      this.loadedSource = url;
      if (autoManifest) {
        // Real hls.js parses asynchronously; keep that ordering.
        queueMicrotask(() => this.emit(HLS_EVENTS.MANIFEST_PARSED, { levels }));
      }
    }

    startLoad() {
      this.startLoadCalls += 1;
    }

    recoverMediaError() {
      this.recoverMediaErrorCalls += 1;
    }

    swapAudioCodec() {
      this.swapAudioCodecCalls += 1;
    }

    destroy() {
      this.destroyCalls += 1;
    }
  }

  return { engine: FakeHls, instances };
}

// --- SCN-hls-mse ----------------------------------------------------------
// Given an MSE browser, when a playlist parses with at least one playable
// level, then attach resolves; when hls.js drops every level (e.g. an
// HEVC-only ladder on Firefox) or errors fatally, then attach fails with a
// specific, user-facing message instead of a bare "no playable source".

test("attachHlsSource resolves once the manifest parses, and configures hls.js", async () => {
  const video = makeFakeVideo("");
  const { engine, instances } = makeFakeEngine();
  const handle = await attachHlsSource(video, "https://cdn.example/v.m3u8", {
    createEngine: async () => engine,
  });

  assert.equal(handle.mode, "mse");
  // Native `src` must stay untouched — MSE owns the element now.
  assert.equal(video.src, "");
  // A bounded back-buffer matters for hour-long VOD on low-memory devices.
  assert.equal(instances[0].config.backBufferLength, 90);
  assert.equal(instances[0].config.enableWorker, true);
});

test("attachHlsSource fails when no rendition survives codec filtering", async () => {
  const video = makeFakeVideo("");
  const { engine, instances } = makeFakeEngine({ levels: [] });
  const messages = [];

  const handle = await attachHlsSource(video, "https://cdn.example/v.m3u8", {
    createEngine: async () => engine,
    onFatalError: (message) => messages.push(message),
  });

  assert.equal(handle, null);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /codec your browser supports/i);
  assert.equal(instances[0].destroyCalls, 1, "must not leak the instance");
  assert.equal(getAttachedHls(video), null);
});

test("attachHlsSource returns null when hls.js is unsupported here", async () => {
  const video = makeFakeVideo("");
  class Unsupported {
    static isSupported() {
      return false;
    }
  }
  const handle = await attachHlsSource(video, "https://cdn.example/v.m3u8", {
    createEngine: async () => Unsupported,
  });
  assert.equal(handle, null);
  assert.equal(video.src, "", "must not fall back to an unplayable src");
});

test("attachHlsSource returns null when the engine bundle fails to load", async () => {
  const video = makeFakeVideo("");
  const handle = await attachHlsSource(video, "https://cdn.example/v.m3u8", {
    createEngine: async () => null,
  });
  assert.equal(handle, null);
});

test("a fatal network error retries twice before giving up", async () => {
  const video = makeFakeVideo("");
  const { engine, instances } = makeFakeEngine({ autoManifest: false });
  const messages = [];

  const pending = attachHlsSource(video, "https://cdn.example/v.m3u8", {
    createEngine: async () => engine,
    onFatalError: (message) => messages.push(message),
  });
  await Promise.resolve();
  const instance = instances[0];

  const networkError = {
    fatal: true,
    type: HLS_ERROR_TYPES.NETWORK_ERROR,
    details: "manifestLoadError",
  };
  instance.emit(HLS_EVENTS.ERROR, networkError);
  assert.equal(instance.startLoadCalls, 1);
  instance.emit(HLS_EVENTS.ERROR, networkError);
  assert.equal(instance.startLoadCalls, 2);
  // Third fatal network error exhausts the retry budget.
  instance.emit(HLS_EVENTS.ERROR, networkError);
  assert.equal(instance.startLoadCalls, 2);

  assert.equal(await pending, null);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /network or CORS/i);
  assert.equal(instance.destroyCalls, 1);
});

test("a fatal media error recovers, then swaps audio codec, then gives up", async () => {
  const video = makeFakeVideo("");
  const { engine, instances } = makeFakeEngine({ autoManifest: false });
  const messages = [];

  const pending = attachHlsSource(video, "https://cdn.example/v.m3u8", {
    createEngine: async () => engine,
    onFatalError: (message) => messages.push(message),
  });
  await Promise.resolve();
  const instance = instances[0];

  const mediaError = {
    fatal: true,
    type: HLS_ERROR_TYPES.MEDIA_ERROR,
    details: "bufferAppendError",
  };
  instance.emit(HLS_EVENTS.ERROR, mediaError);
  assert.equal(instance.recoverMediaErrorCalls, 1);
  assert.equal(instance.swapAudioCodecCalls, 0);

  instance.emit(HLS_EVENTS.ERROR, mediaError);
  assert.equal(instance.recoverMediaErrorCalls, 2);
  assert.equal(instance.swapAudioCodecCalls, 1, "second attempt swaps codec");

  instance.emit(HLS_EVENTS.ERROR, mediaError);
  assert.equal(instance.recoverMediaErrorCalls, 2, "budget exhausted");

  assert.equal(await pending, null);
  assert.match(messages[0], /codec your browser cannot decode/i);
});

test("non-fatal errors never tear the stream down", async () => {
  const video = makeFakeVideo("");
  const { engine, instances } = makeFakeEngine({ autoManifest: false });
  const messages = [];

  const pending = attachHlsSource(video, "https://cdn.example/v.m3u8", {
    createEngine: async () => engine,
    onFatalError: (message) => messages.push(message),
  });
  await Promise.resolve();
  const instance = instances[0];

  instance.emit(HLS_EVENTS.ERROR, {
    fatal: false,
    type: HLS_ERROR_TYPES.NETWORK_ERROR,
    details: "fragLoadError",
  });

  assert.equal(instance.destroyCalls, 0);
  assert.equal(messages.length, 0);

  // A transient fragment error must still let the stream come up.
  instance.emit(HLS_EVENTS.MANIFEST_PARSED, { levels: [{ height: 720 }] });
  const handle = await pending;
  assert.equal(handle.mode, "mse");
});

test("a stuck manifest fails via the attach timeout rather than hanging", async () => {
  const video = makeFakeVideo("");
  const { engine, instances } = makeFakeEngine({ autoManifest: false });
  const messages = [];

  const handle = await attachHlsSource(video, "https://cdn.example/v.m3u8", {
    createEngine: async () => engine,
    manifestTimeoutMs: 20,
    onFatalError: (message) => messages.push(message),
  });

  assert.equal(handle, null);
  assert.match(messages[0], /did not load in time/i);
  assert.equal(instances[0].destroyCalls, 1);
});

test("attachMedia throwing is reported, not propagated", async () => {
  const video = makeFakeVideo("");
  const { engine } = makeFakeEngine({ autoManifest: false });
  const messages = [];
  class Hostile extends engine {
    attachMedia() {
      throw new Error("MediaSource unavailable");
    }
  }

  const handle = await attachHlsSource(video, "https://cdn.example/v.m3u8", {
    createEngine: async () => Hostile,
    onFatalError: (message) => messages.push(message),
  });

  assert.equal(handle, null);
  assert.match(messages[0], /could not be attached/i);
});

// --- SCN-hls-teardown -----------------------------------------------------
// Given an attached hls.js instance, when the modal tears the element down,
// then destroy() runs exactly once and the element is unbound — otherwise the
// transmuxing worker and segment fetches keep running after the modal closes.

test("detachHls destroys the bound hls.js instance exactly once", async () => {
  const video = makeFakeVideo("");
  const { engine, instances } = makeFakeEngine();

  const handle = await attachHlsSource(video, "https://cdn.example/v.m3u8", {
    createEngine: async () => engine,
  });

  assert.ok(handle, "expected an MSE handle");
  assert.equal(handle.mode, "mse");
  const instance = instances[0];
  assert.equal(getAttachedHls(video), instance);
  assert.equal(instance.loadedSource, "https://cdn.example/v.m3u8");
  assert.equal(instance.attachedMedia, video);

  assert.equal(detachHls(video), true);
  assert.equal(instance.destroyCalls, 1);
  assert.equal(getAttachedHls(video), null);

  // Second detach (e.g. modal teardown after the session already reset) must
  // not double-destroy — hls.js throws on a destroyed instance.
  assert.equal(detachHls(video), false);
  assert.equal(instance.destroyCalls, 1);
});

test("handle.destroy() tears the instance down too", async () => {
  const video = makeFakeVideo("");
  const { engine, instances } = makeFakeEngine();
  const handle = await attachHlsSource(video, "https://cdn.example/v.m3u8", {
    createEngine: async () => engine,
  });
  handle.destroy();
  assert.equal(instances[0].destroyCalls, 1);
  assert.equal(getAttachedHls(video), null);
});

test("re-attaching to the same element destroys the previous instance", async () => {
  const video = makeFakeVideo("");
  const { engine, instances } = makeFakeEngine();
  await attachHlsSource(video, "https://cdn.example/a.m3u8", {
    createEngine: async () => engine,
  });
  await attachHlsSource(video, "https://cdn.example/b.m3u8", {
    createEngine: async () => engine,
  });
  assert.equal(instances.length, 2);
  assert.equal(instances[0].destroyCalls, 1, "first instance must be destroyed");
  assert.equal(instances[1].destroyCalls, 0);
  assert.equal(instances[1].loadedSource, "https://cdn.example/b.m3u8");
  assert.equal(getAttachedHls(video), instances[1]);
});

test("detachHls is a safe no-op for non-HLS elements and null", () => {
  assert.equal(detachHls(null), false);
  assert.equal(detachHls(undefined), false);
  assert.equal(detachHls(makeFakeVideo("")), false);
});

test("getAttachedHls returns null when nothing is bound", () => {
  assert.equal(getAttachedHls(makeFakeVideo("")), null);
  assert.equal(getAttachedHls(null), null);
});

// --- SCN-hls-probe --------------------------------------------------------
// Given the URL-health badge probing an HLS URL on an MSE browser, when the
// playlist is CORS-readable and starts with #EXTM3U, then the source is "ok".
// A bare <video> probe (the old path) reported every such URL as offline, which
// combined with the magnet-less "unhealthy" stream badge marks the card
// confirmed-dead and hides it from the grid.

const withFetch = async (impl, fn) => {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
};

test("probeHlsManifest returns ok for a readable #EXTM3U playlist", async () => {
  const result = await withFetch(
    async () => ({
      ok: true,
      text: async () =>
        '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=584301,CODECS="avc1.640015"\nlow.m3u8\n',
    }),
    () => probeHlsManifest("https://cdn.example/v.m3u8")
  );
  assert.equal(result, "ok");
});

test("probeHlsManifest tolerates leading whitespace/BOM-ish padding", async () => {
  const result = await withFetch(
    async () => ({ ok: true, text: async () => "\n\n  #EXTM3U\n" }),
    () => probeHlsManifest("https://cdn.example/v.m3u8")
  );
  assert.equal(result, "ok");
});

test("probeHlsManifest reports error for a non-playlist body", async () => {
  const result = await withFetch(
    async () => ({ ok: true, text: async () => "<html>404</html>" }),
    () => probeHlsManifest("https://cdn.example/v.m3u8")
  );
  assert.equal(result, "error");
});

test("probeHlsManifest reports error for a non-2xx response", async () => {
  const result = await withFetch(
    async () => ({ ok: false, status: 403, text: async () => "#EXTM3U" }),
    () => probeHlsManifest("https://cdn.example/v.m3u8")
  );
  assert.equal(result, "error");
});

test("probeHlsManifest reports error when the fetch rejects (CORS/DNS)", async () => {
  const result = await withFetch(
    async () => {
      throw new TypeError("Failed to fetch");
    },
    () => probeHlsManifest("https://cdn.example/v.m3u8")
  );
  assert.equal(result, "error");
});

test("probeHlsManifest distinguishes a timeout from a hard error", async () => {
  const result = await withFetch(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        // Never settles on its own; the probe's own AbortController must fire.
        options?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      }),
    () => probeHlsManifest("https://cdn.example/v.m3u8", 30)
  );
  assert.equal(result, "timeout");
});

test("probeHlsManifest rejects empty input without touching the network", async () => {
  let called = false;
  const result = await withFetch(
    async () => {
      called = true;
      return { ok: true, text: async () => "#EXTM3U" };
    },
    () => probeHlsManifest("   ")
  );
  assert.equal(result, "error");
  assert.equal(called, false);
});
