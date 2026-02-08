// benchmarks/render_loop_overhead_bench.js

class WatchHistoryTelemetry {
  persistMetadataForVideo(video, pointerInfo) {
    // Deprecated - effectively a no-op in real code
  }
}

class ModalCoordinator {
  constructor() {
    this.watchHistoryTelemetry = new WatchHistoryTelemetry();
  }
  persistWatchHistoryMetadataForVideo(video, pointerInfo) {
    if (this.watchHistoryTelemetry) {
      this.watchHistoryTelemetry.persistMetadataForVideo(video, pointerInfo);
      return;
    }
  }
}

class App {
  constructor() {
    this._modal = new ModalCoordinator();
    this._coordinatorsReady = true; // Simulating initialized state
  }

  _initCoordinators() {
    if (this._coordinatorsReady) return;
    this._coordinatorsReady = true;
  }

  persistWatchHistoryMetadataForVideo(...args) {
    this._initCoordinators();
    return this._modal.persistWatchHistoryMetadataForVideo(...args);
  }
}

const app = new App();
const video = { id: "test", title: "test" };
const pointerInfo = { key: "test" };

const ITERATIONS = 100_000_000;

console.log(`Benchmarking overhead for ${ITERATIONS.toLocaleString()} iterations...`);

const startWithCall = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  if (
    pointerInfo &&
    typeof app?.persistWatchHistoryMetadataForVideo === "function"
  ) {
    app.persistWatchHistoryMetadataForVideo(video, pointerInfo);
  }
}
const endWithCall = performance.now();
const durationWithCall = endWithCall - startWithCall;

const startWithoutCall = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  // Simulating the removal of the call
  if (false) { // Condition becomes false or code is removed
     // Removed
  }
}
const endWithoutCall = performance.now();
const durationWithoutCall = endWithoutCall - startWithoutCall;

console.log(`With call: ${durationWithCall.toFixed(2)}ms`);
console.log(`Without call: ${durationWithoutCall.toFixed(2)}ms`);
console.log(`Improvement: ${(durationWithCall - durationWithoutCall).toFixed(2)}ms`);
console.log(`Relative improvement: ${(durationWithCall / durationWithoutCall).toFixed(2)}x`);
