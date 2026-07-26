import test from "node:test";
import assert from "node:assert/strict";
import {
  installRequestMonitor,
  isRequestMonitorEnabled,
  REQUEST_MONITOR_STORAGE_KEY,
} from "../js/devReqMonitor.js";

function storage(value = null) {
  return { getItem: (key) => (key === REQUEST_MONITOR_STORAGE_KEY ? value : null) };
}

function createScope({ hostname = "localhost", enabled = false } = {}) {
  class FakeWebSocket {
    send(data) {
      this.sent = data;
      return "sent";
    }
  }
  const intervals = [];
  return {
    location: { hostname },
    localStorage: storage(enabled ? "1" : null),
    WebSocket: FakeWebSocket,
    setInterval: (callback, delay) => {
      intervals.push({ callback, delay });
      return intervals.length;
    },
    clearInterval: () => {},
    console: { info: () => {}, warn: () => {} },
    intervals,
  };
}

test("request monitor stays disabled on localhost until explicitly enabled", () => {
  const scope = createScope();
  const originalSend = scope.WebSocket.prototype.send;
  assert.equal(installRequestMonitor({ scope }), null);
  assert.equal(scope.WebSocket.prototype.send, originalSend);
  assert.equal(scope.intervals.length, 0);
});

test("request monitor cannot be enabled on a public host", () => {
  assert.equal(
    isRequestMonitorEnabled({
      locationRef: { hostname: "unstable.bitvid.network" },
      storage: storage("1"),
    }),
    false,
  );
});

test("explicit loopback opt-in patches REQ sends and can be stopped", () => {
  const scope = createScope({ enabled: true });
  const originalSend = scope.WebSocket.prototype.send;
  const monitor = installRequestMonitor({ scope });

  assert.ok(monitor);
  assert.notEqual(scope.WebSocket.prototype.send, originalSend);
  assert.equal(scope.intervals.length, 1);
  assert.equal(scope.intervals[0].delay, 2000);

  const socket = new scope.WebSocket();
  assert.equal(socket.send('["REQ","sub",{"kinds":[1]}]'), "sent");
  assert.equal(socket.sent, '["REQ","sub",{"kinds":[1]}]');

  monitor.stop();
  assert.equal(scope.WebSocket.prototype.send, originalSend);
  assert.equal(scope.__bitvidReqMonitorInstalled, undefined);
});
