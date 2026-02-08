/**
 * A lightweight event emitter used by services to communicate state changes
 * and other events to the UI and other parts of the application.
 */
export class SimpleEventEmitter {
  /**
   * @param {Function|null} logger - Optional logger function for error reporting.
   * @param {string} context - Optional context string for error messages.
   */
  constructor(logger = null, context = "SimpleEventEmitter") {
    this.logger = typeof logger === "function" ? logger : null;
    this.context = typeof context === "string" ? context : "SimpleEventEmitter";
    this.listeners = new Map();
  }

  /**
   * Registers a handler for a specific event.
   * @param {string} eventName
   * @param {Function} handler
   * @returns {Function} Unsubscribe function.
   */
  on(eventName, handler) {
    if (typeof handler !== "function") {
      return () => {};
    }
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    const handlers = this.listeners.get(eventName);
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
      if (!handlers.size) {
        this.listeners.delete(eventName);
      }
    };
  }

  /**
   * Emits an event to all registered handlers.
   * @param {string} eventName
   * @param {any} detail
   */
  emit(eventName, detail) {
    const handlers = this.listeners.get(eventName);
    if (!handlers || !handlers.size) {
      return;
    }

    for (const handler of Array.from(handlers)) {
      try {
        handler(detail);
      } catch (error) {
        if (this.logger) {
          try {
            this.logger(`${this.context} listener for "${eventName}" threw`, error);
          } catch (logError) {
            // Fallback if the provided logger itself throws
            console.warn(`[${this.context}] listener logger threw`, logError);
          }
        }
      }
    }
  }
}
