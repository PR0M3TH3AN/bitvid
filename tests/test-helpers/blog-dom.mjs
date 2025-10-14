import { JSDOM } from 'jsdom';

const DOM_GLOBALS = [
  'window',
  'document',
  'HTMLElement',
  'HTMLStyleElement',
  'Element',
  'Node',
  'Event',
  'MouseEvent',
  'CustomEvent',
  'KeyboardEvent',
  'MutationObserver',
  'getComputedStyle',
];

export function createSpy(implementation = () => {}) {
  function spy(...args) {
    spy.calls.push(args);
    spy.callCount += 1;
    return implementation(...args);
  }
  spy.calls = [];
  spy.callCount = 0;
  return spy;
}

export function createAnimationFrameStub() {
  let now = 0;
  let handle = 0;
  const queue = new Map();

  function requestAnimationFrame(callback) {
    handle += 1;
    const id = handle;
    queue.set(id, callback);
    return id;
  }

  function cancelAnimationFrame(id) {
    queue.delete(id);
  }

  function step(elapsed = 0) {
    now += elapsed;
    const callbacks = Array.from(queue.entries());
    queue.clear();
    for (const [, callback] of callbacks) {
      callback(now);
    }
  }

  return {
    requestAnimationFrame,
    cancelAnimationFrame,
    step,
    get now() {
      return now;
    },
    get pending() {
      return queue.size;
    },
  };
}

export function installInlineStyleGuard(document) {
  const originalCreateElement = document.createElement.bind(document);
  const ElementConstructor = document.defaultView?.Element;
  const guardedElements = new WeakSet();
  const attributePatches = [];

  if (ElementConstructor?.prototype) {
    const prototype = ElementConstructor.prototype;

    if (typeof prototype.setAttribute === 'function') {
      const original = prototype.setAttribute;
      prototype.setAttribute = function inlineStyleSafeSetAttribute(name, value) {
        if (typeof name === 'string' && name.toLowerCase() === 'style') {
          throw new Error(
            'Inline style attributes are disabled in blog widget tests. Use CSS classes or data attributes instead.',
          );
        }
        return original.call(this, name, value);
      };
      attributePatches.push(() => {
        prototype.setAttribute = original;
      });
    }

    if (typeof prototype.setAttributeNS === 'function') {
      const original = prototype.setAttributeNS;
      prototype.setAttributeNS = function inlineStyleSafeSetAttributeNS(namespace, name, value) {
        if (typeof name === 'string' && name.toLowerCase() === 'style') {
          throw new Error(
            'Inline style attributes are disabled in blog widget tests. Use CSS classes or data attributes instead.',
          );
        }
        return original.call(this, namespace, name, value);
      };
      attributePatches.push(() => {
        prototype.setAttributeNS = original;
      });
    }
  }

  function guard(element) {
    if (!element || typeof element !== 'object') {
      return element;
    }

    if (guardedElements.has(element)) {
      return element;
    }

    Object.defineProperty(element, 'style', {
      get() {
        throw new Error(
          'Inline style access is disabled in blog widget tests. Use CSS classes or data attributes instead.',
        );
      },
      set() {
        throw new Error(
          'Inline style assignment is disabled in blog widget tests. Use CSS classes or data attributes instead.',
        );
      },
      configurable: true,
    });

    guardedElements.add(element);

    if (element.children?.length) {
      Array.from(element.children).forEach((child) => guard(child));
    }

    return element;
  }

  document.createElement = function createElementGuarded(...args) {
    const element = originalCreateElement(...args);
    guard(element);
    return element;
  };

  return {
    guard,
    restore() {
      document.createElement = originalCreateElement;
      attributePatches.forEach((restorePatch) => {
        try {
          restorePatch();
        } catch (error) {
          // ignore failures to restore in tests
        }
      });
    },
  };
}

export function createBlogDomEnvironment(html) {
  const dom = new JSDOM(html, { url: 'https://example.com' });
  const { window } = dom;
  const previousGlobals = new Map();

  for (const key of DOM_GLOBALS) {
    previousGlobals.set(key, globalThis[key]);
    const nextValue = window[key];
    if (typeof nextValue !== 'undefined') {
      globalThis[key] = nextValue;
    } else {
      delete globalThis[key];
    }
  }

  const inlineStyleGuard = installInlineStyleGuard(window.document);
  const raf = createAnimationFrameStub();

  previousGlobals.set('requestAnimationFrame', globalThis.requestAnimationFrame);
  previousGlobals.set('cancelAnimationFrame', globalThis.cancelAnimationFrame);

  globalThis.requestAnimationFrame = raf.requestAnimationFrame;
  globalThis.cancelAnimationFrame = raf.cancelAnimationFrame;
  window.requestAnimationFrame = raf.requestAnimationFrame;
  window.cancelAnimationFrame = raf.cancelAnimationFrame;

  return {
    window,
    document: window.document,
    dom,
    raf,
    inlineStyleGuard,
    cleanup() {
      inlineStyleGuard.restore();
      dom.window.close();

      for (const [key, value] of previousGlobals) {
        if (typeof value === 'undefined') {
          delete globalThis[key];
        } else {
          globalThis[key] = value;
        }
      }
    },
  };
}
