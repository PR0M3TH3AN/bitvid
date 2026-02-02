// js/applicationContext.js

let applicationInstance = null;
let readyPromise = Promise.resolve();

export function setApplication(app) {
  applicationInstance = app || null;
}

export function getApplication() {
  return applicationInstance;
}

export function setApplicationReady(promise) {
  if (promise && typeof promise.then === "function") {
    readyPromise = promise;
  } else {
    readyPromise = Promise.resolve(promise);
  }
}

export function getApplicationReady() {
  return readyPromise;
}
