// js/app/bindCoordinator.js

/**
 * Binds every method on a coordinator object to the given Application instance.
 *
 * Coordinator factories return plain objects whose methods reference `this`
 * (the Application) and close over injected `deps`. This helper produces a
 * mirror object where every function-valued property is bound to `app`, so
 * callers can invoke `coordinator.method()` without worrying about context.
 *
 * @param {object} app  - The Application instance to bind to.
 * @param {object} raw  - The object returned by a coordinator factory.
 * @returns {object} A new object with every method bound to `app`.
 */
export default function bindCoordinator(app, raw) {
  const bound = Object.create(null);
  for (const key of Object.keys(raw)) {
    const value = raw[key];
    bound[key] = typeof value === "function" ? value.bind(app) : value;
  }
  return bound;
}
