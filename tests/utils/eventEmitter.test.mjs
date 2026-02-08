import { describe, test, mock } from "node:test";
import assert from "node:assert/strict";
import { SimpleEventEmitter } from "../../js/utils/eventEmitter.js";

describe("SimpleEventEmitter", () => {
  test("should register and emit events", () => {
    const emitter = new SimpleEventEmitter();
    const handler = mock.fn();

    emitter.on("test", handler);
    emitter.emit("test", { data: 123 });

    assert.strictEqual(handler.mock.callCount(), 1);
    assert.deepStrictEqual(handler.mock.calls[0].arguments[0], { data: 123 });
  });

  test("should support multiple handlers", () => {
    const emitter = new SimpleEventEmitter();
    const handler1 = mock.fn();
    const handler2 = mock.fn();

    emitter.on("test", handler1);
    emitter.on("test", handler2);
    emitter.emit("test", "foo");

    assert.strictEqual(handler1.mock.callCount(), 1);
    assert.strictEqual(handler2.mock.callCount(), 1);
  });

  test("should unsubscribe correctly", () => {
    const emitter = new SimpleEventEmitter();
    const handler = mock.fn();

    const unsub = emitter.on("test", handler);
    unsub();
    emitter.emit("test", "foo");

    assert.strictEqual(handler.mock.callCount(), 0);
  });

  test("should handle errors in handlers and use logger", () => {
    const logger = mock.fn();
    const emitter = new SimpleEventEmitter(logger, "TestContext");
    const errorHandler = () => { throw new Error("fail"); };

    emitter.on("error-event", errorHandler);
    emitter.emit("error-event", "some-detail");

    assert.strictEqual(logger.mock.callCount(), 1);
    assert.match(logger.mock.calls[0].arguments[0], /TestContext listener for "error-event" threw/);
    assert.strictEqual(logger.mock.calls[0].arguments[1].message, "fail");
  });
});
