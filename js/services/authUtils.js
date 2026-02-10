
export const FALLBACK_PROFILE = {
  name: "Unknown",
  picture: "assets/svg/default-profile.svg",
  about: "",
  website: "",
  banner: "",
  lud16: "",
  lud06: "",
};

export const FAST_PROFILE_RELAY_LIMIT = 3;
export const FAST_PROFILE_TIMEOUT_MS = 2500;
export const BACKGROUND_PROFILE_TIMEOUT_MS = 6000;

export function normalizeProviderId(providerId) {
  return typeof providerId === "string" && providerId.trim()
    ? providerId.trim()
    : "nip07";
}

export function normalizeAuthType(authTypeCandidate, providerId, providerResult) {
  const candidates = [];

  if (typeof authTypeCandidate === "string") {
    candidates.push(authTypeCandidate);
  }

  if (providerResult && typeof providerResult === "object") {
    const resultAuthType = providerResult.authType;
    if (typeof resultAuthType === "string") {
      candidates.push(resultAuthType);
    }

    const resultProviderId = providerResult.providerId;
    if (typeof resultProviderId === "string") {
      candidates.push(resultProviderId);
    }
  }

  if (typeof providerId === "string") {
    candidates.push(providerId);
  }

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return "nip07";
}
