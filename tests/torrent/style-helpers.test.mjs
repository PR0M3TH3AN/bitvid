import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";

import {
  applyBeaconDynamicStyles,
  removeBeaconDynamicStyles,
  beaconDynamicFallbackClasses,
} from "../../torrent/ui/styleHelpers.js";

describe("torrent/ui/styleHelpers", () => {
  it("returns null when no element is provided", () => {
    assert.equal(applyBeaconDynamicStyles(null), null);
  });

  it("returns the original element without mutations", () => {
    const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>");
    const { document } = dom.window;
    const element = document.createElement("div");

    const result = applyBeaconDynamicStyles(element);

    assert.equal(result, element);
    assert.equal(element.getAttributeNames().length, 0);
  });

  it("provides an empty, frozen fallback map", () => {
    assert.deepEqual(beaconDynamicFallbackClasses, {});
    assert.throws(() => {
      beaconDynamicFallbackClasses.test = "nope";
    }, TypeError);
  });

  it("no-ops when removing styles", () => {
    assert.doesNotThrow(() => removeBeaconDynamicStyles(null));
    const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>");
    const { document } = dom.window;
    const element = document.createElement("div");
    assert.doesNotThrow(() => removeBeaconDynamicStyles(element));
  });
});
