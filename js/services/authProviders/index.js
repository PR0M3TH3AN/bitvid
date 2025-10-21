import nip07Provider from "./nip07.js";
import nsecProvider from "./nsec.js";
import nip46Provider from "./nip46.js";

const providers = [nip07Provider, nsecProvider, nip46Provider].filter(
  (provider) => provider && typeof provider.id === "string",
);

const providersById = providers.reduce((acc, provider) => {
  const key = provider.id;
  if (!acc[key]) {
    acc[key] = provider;
  }
  return acc;
}, Object.create(null));

export function getAuthProvider(providerId) {
  if (typeof providerId !== "string") {
    return null;
  }
  const trimmed = providerId.trim();
  if (!trimmed) {
    return null;
  }
  return providersById[trimmed] || null;
}

export function listAuthProviders() {
  return providers.slice();
}

export function initializeAuthProviders(context = {}) {
  for (const provider of providers) {
    if (provider && typeof provider.initialize === "function") {
      try {
        const result = provider.initialize(context);
        if (result && typeof result.then === "function") {
          result.catch((error) => {
            if (context?.logger) {
              try {
                context.logger(
                  `[authProviders] Provider "${provider.id}" initialize rejected`,
                  error,
                );
              } catch (_) {
                // ignore logger failures
              }
            } else if (typeof console !== "undefined" && console?.warn) {
              console.warn(
                `[authProviders] Provider "${provider.id}" initialize rejected`,
                error,
              );
            }
          });
        }
      } catch (error) {
        if (context?.logger) {
          try {
            context.logger(
              `[authProviders] Provider "${provider.id}" initialize failed`,
              error,
            );
          } catch (_) {
            // ignore logger failures
          }
        } else if (typeof console !== "undefined" && console?.warn) {
          console.warn(
            `[authProviders] Provider "${provider.id}" initialize failed`,
            error,
          );
        }
      }
    }
  }
}

export { providersById };
export default providers;
