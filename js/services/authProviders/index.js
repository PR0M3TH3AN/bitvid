import nip07 from "./nip07.js";

const map = {
  [(nip07 && typeof nip07.id === "string" && nip07.id.trim()) || "nip07"]: nip07,
};

if (!Object.prototype.hasOwnProperty.call(map, "nip07")) {
  map.nip07 = nip07;
}

export const providers = Object.freeze({ ...map });

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
