import nip07Provider from "./nip07.js";

const providers = [nip07Provider].filter(
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

export { providersById };
export default providers;
