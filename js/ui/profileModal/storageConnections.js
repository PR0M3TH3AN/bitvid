// Per-provider connection model for the Storage pane.
//
// Each provider type (Cloudflare R2 / Backblaze B2 / Custom S3) gets its OWN connection
// slot, keyed by the provider id, so their credentials don't overwrite or clash. The
// underlying storageService already stores a map of connections + syncs the whole
// account record, so this just stops the UI from collapsing everything into one slot.

export function connectionProvider(conn) {
  return (conn && (conn.provider || conn.meta?.provider)) || "";
}

export function findProviderConnection(connections, provider) {
  return (
    (Array.isArray(connections) ? connections : []).find(
      (c) => connectionProvider(c) === provider,
    ) || null
  );
}

// Keep a sane active upload target: default when the user asked, when it's the first
// connection saved, or when re-saving the provider that was already the default.
export function computeDefaultForUploads({ isDefault, connections, provider }) {
  if (isDefault) {
    return true;
  }
  if (!Array.isArray(connections) || connections.length === 0) {
    return true;
  }
  return (
    findProviderConnection(connections, provider)?.meta?.defaultForUploads === true
  );
}

// Other-id connections of the same provider (e.g. the legacy shared "default" slot)
// that should be removed after saving so they can't clash with the per-provider slot.
export function legacyDuplicateIds(connections, provider, keepId) {
  return (Array.isArray(connections) ? connections : [])
    .filter((c) => c.id !== keepId && connectionProvider(c) === provider)
    .map((c) => c.id);
}

// Persist a connection under its per-provider slot: pick a sane default-for-uploads,
// save, then remove any legacy/duplicate same-provider connection so nothing clashes.
// Returns the connection id used. Shared by the controller + tests (one source of truth).
export async function saveProviderConnection(
  storageService,
  pubkey,
  { provider, payload, meta = {}, isDefault = false } = {},
) {
  const existing = await storageService.listConnections(pubkey);
  meta.defaultForUploads = computeDefaultForUploads({
    isDefault,
    connections: existing,
    provider,
  });
  await storageService.saveConnection(pubkey, provider, payload, meta);
  for (const id of legacyDuplicateIds(existing, provider, provider)) {
    await storageService.deleteConnection(pubkey, id);
  }
  return provider;
}

// Fill the Storage form inputs from a saved connection. `c` is the controller (used for
// its cached input refs + the visibility refresh) — keeps all the element wiring in one
// place without threading a dozen refs through.
export function fillStorageForm(c, conn) {
  if (!conn) {
    return;
  }
  const {
    provider,
    accessKeyId,
    secretAccessKey,
    accountId: payloadAccountId,
    endpoint: payloadEndpoint,
    forcePathStyle: payloadForcePathStyle,
  } = conn;
  const {
    endpoint,
    region,
    bucket,
    prefix,
    defaultForUploads,
    accountId,
    forcePathStyle: metaForcePathStyle,
  } = conn.meta || {};

  if (c.storageProviderInput) {
    c.storageProviderInput.value = provider || "cloudflare_r2";
  }
  const resolvedEndpoint =
    endpoint || accountId || payloadAccountId || payloadEndpoint || "";
  if (c.storageEndpointInput) c.storageEndpointInput.value = resolvedEndpoint;
  if (c.storageRegionInput) c.storageRegionInput.value = region || "auto";
  if (c.storageAccessKeyInput) c.storageAccessKeyInput.value = accessKeyId || "";
  if (c.storageSecretKeyInput) c.storageSecretKeyInput.value = secretAccessKey || "";
  if (c.storageBucketInput) c.storageBucketInput.value = bucket || "";
  if (c.storagePrefixInput) c.storagePrefixInput.value = prefix || "";
  if (c.storageDefaultInput) c.storageDefaultInput.checked = !!defaultForUploads;

  if (c.storageForcePathStyleInput) {
    if (typeof payloadForcePathStyle === "boolean") {
      c.storageForcePathStyleInput.checked = payloadForcePathStyle;
    } else if (typeof metaForcePathStyle === "boolean") {
      c.storageForcePathStyleInput.checked = metaForcePathStyle;
    } else {
      c.storageForcePathStyleInput.checked = true;
    }
  }

  c.updateStorageFormVisibility();
  c.handlePublicUrlInput();
}

// Clear the credential inputs but keep the selected provider (used when switching to a
// provider that has no saved connection yet).
export function clearCredentialFields(c) {
  if (c.storageEndpointInput) c.storageEndpointInput.value = "";
  if (c.storageRegionInput) c.storageRegionInput.value = "auto";
  if (c.storageAccessKeyInput) c.storageAccessKeyInput.value = "";
  if (c.storageSecretKeyInput) c.storageSecretKeyInput.value = "";
  if (c.storageBucketInput) c.storageBucketInput.value = "";
  if (c.storagePrefixInput) c.storagePrefixInput.value = "";
  if (c.storageDefaultInput) c.storageDefaultInput.checked = false;
  c.updateStorageFormVisibility();
}
