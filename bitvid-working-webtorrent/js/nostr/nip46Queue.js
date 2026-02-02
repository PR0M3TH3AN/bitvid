// js/nostr/nip46Queue.js

import { devLogger } from "../utils/logger.js";

export const NIP46_PRIORITY = Object.freeze({
  HIGH: 10,
  NORMAL: 5,
  LOW: 1,
});

export class Nip46RequestQueue {
  constructor({ minDelayMs = 250 } = {}) {
    this.minDelayMs = minDelayMs;
    this.queue = [];
    this.running = false;
    this.lastRunTime = 0;
  }

  enqueue(task, priority = NIP46_PRIORITY.NORMAL) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        task,
        priority: Number.isFinite(priority) ? priority : NIP46_PRIORITY.NORMAL,
        resolve,
        reject,
        addedAt: Date.now(),
      });
      // Sort by priority (descending), then by insertion time (ascending) for fairness
      this.queue.sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return a.addedAt - b.addedAt;
      });
      this.process();
    });
  }

  async process() {
    if (this.running) return;
    this.running = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const timeSinceLast = now - this.lastRunTime;

      if (timeSinceLast < this.minDelayMs) {
        const waitMs = this.minDelayMs - timeSinceLast;
        await new Promise((r) => setTimeout(r, waitMs));
      }

      const item = this.queue.shift();
      if (!item) break; // Should not happen given while condition

      const { task, resolve, reject } = item;

      try {
        const result = await task();
        this.lastRunTime = Date.now();
        resolve(result);
      } catch (error) {
        this.lastRunTime = Date.now();
        reject(error);
      }
    }

    this.running = false;
  }

  /**
   * Clears the queue, rejecting all pending tasks.
   * Useful when disconnecting or destroying the client.
   */
  clear(error) {
    const pending = this.queue;
    this.queue = [];

    const rejection = error || new Error("Queue cleared");

    for (const item of pending) {
      try {
        item.reject(rejection);
      } catch (e) {
        devLogger.warn("[nostr] Failed to reject cleared queue item:", e);
      }
    }
  }
}
