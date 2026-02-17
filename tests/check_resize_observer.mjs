import test from "node:test";
import assert from "node:assert/strict";

test("check if ResizeObserver exists on globalThis", () => {
    console.log("globalThis.ResizeObserver:", typeof globalThis.ResizeObserver);
});
