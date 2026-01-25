# Storage Tab & Connection Architecture

This document describes the design and architecture of the **Storage Tab** (manage via the Profile or Upload modals) and the underlying `StorageService`.

The system allows users to securely store and manage multiple cloud storage connections (Providers) for video hosting. The architecture prioritizes security (encryption at rest), extensibility (adapter pattern), and provider flexibility (Generic S3 vs. specific implementations like Cloudflare R2).

## Supported Upload Modes

The storage system supports three primary modes for handling video uploads:

1.  **Browser-held S3 keys (trusted operator only):**
    The user enters S3 credentials (Access Key/Secret Key) into the Storage Tab. These keys are encrypted and stored in the browser's IndexedDB. This mode offers the smoothest UX but carries higher risk.
2.  **Manual upload via provider console:**
    The user uploads the file manually to their provider (e.g., R2 dashboard) and simply provides the public URL. This bypasses the need for the browser to hold write credentials.
3.  **Operator-provided presigned manifests:**
    The user provides a JSON manifest generated externally (e.g., by a CLI tool or backend service). This manifest contains presigned URLs for uploading parts, allowing the browser to upload without ever seeing the long-lived credentials.

## 1. Core Architecture: `StorageService`

The `StorageService` (`js/services/storageService.js`) acts as the secure vault for connection secrets. It sits between the UI and the actual storage providers.

### Data Model

All data is stored in **IndexedDB** under the database `bitvid-storage` and object store `accounts`.

**Schema Structure:**

```javascript
{
  pubkey: "hex-pubkey",             // Primary Key
  encryptedMasterKey: {             // The "Key to the Kingdom"
    method: "nip44" | "nip04",      // Encryption method used (NIP-44 preferred)
    ciphertext: "..."               // The AES-GCM Master Key encrypted by the User's Signer
  },
  connections: {                    // Map of connection configurations
    "conn-uuid-1": {
      id: "conn-uuid-1",
      provider: "cloudflare_r2",    // Provider ID
      meta: {                       // Plaintext Metadata (safe to read without unlocking)
        label: "My R2 Bucket",
        defaultForUploads: true,
        lastSaved: 1234567890
      },
      encrypted: {                  // Encrypted Secrets (AES-GCM)
        cipher: "hex-cipher-string",
        iv: "hex-iv-string"
      }
    }
  }
}
```

### Encryption Strategy (Dual-Layer)

To balance security with usability (minimizing NIP-07/NIP-44 prompts), the system uses a dual-layer encryption approach:

1.  **Layer 1: The Master Key (Session Key)**
    *   A random 256-bit **AES-GCM** key is generated when the user first sets up storage.
    *   This key is encrypted **once** using the user's Nostr Signer (NIP-44 or NIP-04) and stored as `encryptedMasterKey`.
    *   **Unlocking:** When the user "unlocks" storage, the app requests the signer to decrypt this key. The decrypted Master Key is held in memory for the session.

2.  **Layer 2: Payload Encryption**
    *   Actual connection secrets (Access Keys, Secret Keys) are encrypted using the **Master Key** (AES-GCM).
    *   This allows the app to save/load multiple connections during a session without re-prompting the user's signer for every single field.

## 2. Provider Adapter Pattern

The system uses an adapter pattern to support multiple providers.

*   **Provider IDs:** Defined in `PROVIDERS` (e.g., `cloudflare_r2`, `aws_s3`, `generic_s3`).
*   **Test Handlers:** A `PROVIDER_TESTS` map routes connection tests to the appropriate handler.

```javascript
// js/services/storageService.js
const PROVIDER_TESTS = {
  [PROVIDERS.R2]: testS3Connection,
  [PROVIDERS.S3]: testS3Connection,     // Reuses S3 logic
  [PROVIDERS.GENERIC]: testS3Connection // Reuses S3 logic
};
```

This design allows adding new providers (e.g., FTP, IPFS, etc.) by registering a new ID and a corresponding test function.

## 3. Connection Payloads & Profiles

Different providers require different configuration schemas.

### Generic S3 Provider (`generic_s3`)
The baseline schema for any S3-compatible service.

*   **Payload (Encrypted):**
    *   `endpoint`: Full URL to the S3 API (e.g., `https://s3.us-east-1.amazonaws.com`).
    *   `region`: AWS Region (e.g., `us-east-1`).
    *   `accessKeyId`: API Key ID.
    *   `secretAccessKey`: API Secret.
    *   `bucket`: Target bucket name.

### Cloudflare R2 Provider (`cloudflare_r2`)
A specialized profile of S3 with specific constraints to improve UX.

*   **Payload (Encrypted):**
    *   `accountId`: Cloudflare Account ID (used to construct the endpoint).
    *   `accessKeyId` & `secretAccessKey`.
    *   `bucket`: (Optional) Target bucket.
*   **Adapter Logic:**
    The `makeR2Client` adapter (`js/storage/r2-s3.js`) detects the `accountId` and automatically constructs the standard Cloudflare endpoint:
    `https://<accountId>.r2.cloudflarestorage.com`

## 4. Security & Privacy Warnings

### Local Storage & XSS
*   **Risk:** The encrypted data resides in the browser's **IndexedDB**. While encrypted at rest, a malicious script (XSS attack) running in the context of the application could potentially request the signer to decrypt the Master Key or read the decrypted key from memory if the session is active.
*   **Warning:** Because of this risk, **Mode 1 (Browser-held keys)** should only be used on **self-hosted, trusted deployments** where the operator controls the environment. Do not enter high-value credentials on public, untrusted, or shared instances.
*   **Mitigation:** The application must maintain strict Content Security Policy (CSP) and dependency hygiene to prevent XSS. Use Mode 2 or 3 for higher security assurance in untrusted environments.

### Ephemeral Key Derivation (Kind 22242)
To consistently derive or verify keys without publishing sensitive data, the system uses a **Storage Challenge Event**.

*   **Kind:** `22242` (`NOTE_TYPES.STORAGE_CHALLENGE`)
*   **Purpose:** This event is created ephemerally to challenge the signer. The signature of this event is used as a seed to derive the encryption keys or to verify ownership.
*   **Privacy:** This event is **NEVER** published to relays. It exists solely in the local client memory during the unlocking process.

### Secret Handling
*   Secrets (Access Keys) are **never** stored in plain text in IndexedDB or LocalStorage.
*   Secrets are only decrypted in memory when needed (e.g., to perform an upload or list buckets).
*   Logging of secret values is strictly prohibited.
