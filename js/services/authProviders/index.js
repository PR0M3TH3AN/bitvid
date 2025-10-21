import nip07 from "./nip07.js";

function normalizeProviderId(provider, fallbackId) {
  if (provider && typeof provider.id === "string") {
    const trimmed = provider.id.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  if (typeof fallbackId === "string") {
    const trimmed = fallbackId.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return "provider";
}

function normalizeProviderMetadata(provider, fallbackId) {
  const id = normalizeProviderId(provider, fallbackId);
  const label =
    provider && typeof provider.label === "string" && provider.label.trim()
      ? provider.label.trim()
      : "Saved profile";
  const description =
    provider && typeof provider.description === "string" && provider.description.trim()
      ? provider.description.trim()
      : "";
  const badgeVariant =
    provider && typeof provider.badgeVariant === "string" && provider.badgeVariant.trim()
      ? provider.badgeVariant.trim()
      : "neutral";

  return Object.freeze({ id, label, description, badgeVariant });
}

const providerList = [nip07].filter(Boolean);
const providerMap = {};
const metadataMap = {};

providerList.forEach((provider, index) => {
  const fallbackId = `provider-${index}`;
  const id = normalizeProviderId(provider, fallbackId);
  providerMap[id] = provider;
  metadataMap[id] = normalizeProviderMetadata(provider, id);
});

if (!Object.prototype.hasOwnProperty.call(providerMap, "nip07")) {
  providerMap.nip07 = nip07;
  metadataMap.nip07 = normalizeProviderMetadata(nip07, "nip07");
} else if (!Object.prototype.hasOwnProperty.call(metadataMap, "nip07")) {
  metadataMap.nip07 = normalizeProviderMetadata(providerMap.nip07, "nip07");
}

const builtInMetadata = [
  {
    id: "nsec",
    label: "Direct key",
    description: "Use a saved nsec key stored locally.",
    badgeVariant: "warning",
  },
];

builtInMetadata.forEach((entry) => {
  if (!entry || typeof entry !== "object") {
    return;
  }

  const id =
    typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : null;
  if (!id || Object.prototype.hasOwnProperty.call(metadataMap, id)) {
    return;
  }

  metadataMap[id] = Object.freeze({
    id,
    label:
      typeof entry.label === "string" && entry.label.trim()
        ? entry.label.trim()
        : "Saved profile",
    description:
      typeof entry.description === "string" && entry.description.trim()
        ? entry.description.trim()
        : "",
    badgeVariant:
      typeof entry.badgeVariant === "string" && entry.badgeVariant.trim()
        ? entry.badgeVariant.trim()
        : "neutral",
  });
});

export const providers = Object.freeze({ ...providerMap });
export const providerMetadata = Object.freeze({ ...metadataMap });

const unknownMetadataCache = new Map();

function getFallbackMetadata(providerId) {
  const id =
    typeof providerId === "string" && providerId.trim() ? providerId.trim() : "unknown";
  if (!unknownMetadataCache.has(id)) {
    unknownMetadataCache.set(
      id,
      Object.freeze({
        id,
        label: "Saved profile",
        description: "",
        badgeVariant: "neutral",
      }),
    );
  }
  return unknownMetadataCache.get(id);
}

export function getProviderMetadata(providerId) {
  if (typeof providerId === "string" && providerId.trim()) {
    const normalizedId = providerId.trim();
    if (Object.prototype.hasOwnProperty.call(providerMetadata, normalizedId)) {
      return providerMetadata[normalizedId];
    }
    return getFallbackMetadata(normalizedId);
  }

  return getFallbackMetadata("saved-profile");
}

export function getProvider(providerId = "nip07") {
  const id =
    typeof providerId === "string" && providerId.trim()
      ? providerId.trim()
      : "nip07";

  const provider = providers[id];
  if (!provider || typeof provider.login !== "function") {
    const error = new Error(`Unknown auth provider: ${id}`);
    error.code = "unknown-auth-provider";
    throw error;
  }

  return provider;
}

export default getProvider;
