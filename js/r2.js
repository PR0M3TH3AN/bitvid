const S3_MODULE_URL =
  "https://esm.sh/@aws-sdk/client-s3@3.614.0?target=es2022&bundle";

const DB_NAME = "bitvidSettings";
const DB_VERSION = 1;
const STORE_NAME = "kv";
const SETTINGS_KEY = "r2Settings";
const LOCALSTORAGE_FALLBACK_KEY = "bitvid:r2Settings";

let s3ModulePromise = null;

function loadS3Module() {
  if (!s3ModulePromise) {
    s3ModulePromise = import(S3_MODULE_URL);
  }
  return s3ModulePromise;
}

function isIndexedDbAvailable() {
  try {
    return typeof indexedDB !== "undefined";
  } catch (err) {
    return false;
  }
}

function openSettingsDb() {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      resolve(null);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error("Failed to open settings DB"));
    };
  });
}

function normalizeSettings(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      accountId: "",
      accessKeyId: "",
      secretAccessKey: "",
      publicBaseUrlTemplate: "",
      bucketMode: "auto",
      manualBucket: "",
      autoBuckets: {},
    };
  }

  return {
    accountId: String(raw.accountId || ""),
    accessKeyId: String(raw.accessKeyId || ""),
    secretAccessKey: String(raw.secretAccessKey || ""),
    publicBaseUrlTemplate: String(raw.publicBaseUrlTemplate || ""),
    bucketMode: raw.bucketMode === "manual" ? "manual" : "auto",
    manualBucket: String(raw.manualBucket || ""),
    autoBuckets:
      raw.autoBuckets && typeof raw.autoBuckets === "object"
        ? { ...raw.autoBuckets }
        : {},
  };
}

export async function loadR2Settings() {
  try {
    const db = await openSettingsDb();
    if (db) {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(SETTINGS_KEY);
        req.onsuccess = () => {
          resolve(normalizeSettings(req.result));
        };
        req.onerror = () => {
          reject(req.error || new Error("Failed to load settings"));
        };
      });
    }
  } catch (err) {
    console.warn("Failed to open IndexedDB for settings, falling back:", err);
  }

  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(LOCALSTORAGE_FALLBACK_KEY);
      if (raw) {
        return normalizeSettings(JSON.parse(raw));
      }
    }
  } catch (err) {
    console.warn("Failed to read fallback settings:", err);
  }

  return normalizeSettings(null);
}

export async function saveR2Settings(settings) {
  const normalized = normalizeSettings(settings);

  let db = null;
  try {
    db = await openSettingsDb();
  } catch (err) {
    console.warn("Unable to open IndexedDB, continuing with fallback:", err);
  }

  if (db) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(normalized, SETTINGS_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () =>
        reject(req.error || new Error("Failed to save R2 settings"));
    });
  } else if (typeof localStorage !== "undefined") {
    localStorage.setItem(
      LOCALSTORAGE_FALLBACK_KEY,
      JSON.stringify(normalized)
    );
  }

  return normalized;
}

export async function clearR2Settings() {
  let cleared = false;
  try {
    const db = await openSettingsDb();
    if (db) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(SETTINGS_KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error || new Error("Failed to clear"));
      });
      cleared = true;
    }
  } catch (err) {
    console.warn("Failed to clear IndexedDB settings:", err);
  }

  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(LOCALSTORAGE_FALLBACK_KEY);
      cleared = true;
    }
  } catch (err) {
    console.warn("Failed to clear fallback settings:", err);
  }

  return cleared;
}

export function bucketForNpub(
  npub,
  { prefix = "bitvid", suffix } = {}
) {
  const suffixValue = suffix || Math.random().toString(36).slice(2, 8);
  const npubPart = String(npub || "").toLowerCase();
  const raw = `${prefix}-${npubPart}-${suffixValue}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  const trimmed = raw.slice(0, 63).replace(/^-+|-+$/g, "");
  return trimmed || `${prefix}-${Date.now()}`;
}

function ensureHeadersObject(req) {
  if (!req) {
    return;
  }

  if (req.headers && typeof req.headers.set === "function") {
    req.headers.set("cf-create-bucket-if-missing", "true");
    return;
  }

  if (req.headers && typeof req.headers === "object") {
    req.headers["cf-create-bucket-if-missing"] = "true";
    return;
  }

  if (typeof req.headers === "undefined") {
    req.headers = { "cf-create-bucket-if-missing": "true" };
  }
}

export async function createR2Client({
  accountId,
  accessKeyId,
  secretAccessKey,
}) {
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Missing required R2 credentials");
  }

  const { S3Client } = await loadS3Module();
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  client.middlewareStack.add(
    (next) => async (args) => {
      ensureHeadersObject(args.request);
      return next(args);
    },
    { step: "build", name: "r2AutoCreateBucket" }
  );

  return client;
}

function guessExtension(file) {
  if (!file) {
    return "mp4";
  }

  const name = typeof file.name === "string" ? file.name : "";
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex > -1 && dotIndex < name.length - 1) {
    return name.slice(dotIndex + 1).toLowerCase();
  }

  const type = typeof file.type === "string" ? file.type : "";
  switch (type) {
    case "video/webm":
      return "webm";
    case "application/vnd.apple.mpegurl":
      return "m3u8";
    case "video/mp2t":
      return "ts";
    case "video/quicktime":
      return "mov";
    case "video/x-matroska":
      return "mkv";
    default:
      return "mp4";
  }
}

export function buildR2Key(npub, file) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const safeNpub = String(npub || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const baseName = typeof file?.name === "string" ? file.name : "video";
  const withoutExt = baseName.replace(/\.[^/.]+$/, "");
  const slug = withoutExt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const safeSlug = slug || "video";
  const ext = guessExtension(file);
  return `u/${safeNpub}/${year}/${month}/${safeSlug}.${ext}`;
}

export async function uploadToR2({
  s3,
  bucket,
  key,
  file,
  contentType,
  onProgress,
  concurrency = 4,
}) {
  if (!s3) {
    throw new Error("S3 client is required");
  }
  if (!bucket) {
    throw new Error("Bucket is required");
  }
  if (!key) {
    throw new Error("Object key is required");
  }
  if (!file) {
    throw new Error("File is required");
  }

  const module = await loadS3Module();
  const {
    CreateMultipartUploadCommand,
    UploadPartCommand,
    CompleteMultipartUploadCommand,
    AbortMultipartUploadCommand,
  } = module;

  const resolvedContentType =
    contentType || file.type || "video/mp4";

  const createCommand = new CreateMultipartUploadCommand({
    Bucket: bucket,
    Key: key,
    ContentType: resolvedContentType,
    CacheControl: resolvedContentType.includes("mpegurl")
      ? "public, max-age=30"
      : "public, max-age=31536000, immutable",
  });

  const { UploadId } = await s3.send(createCommand);
  if (!UploadId) {
    throw new Error("Failed to initiate multipart upload");
  }

  const PART_SIZE = 8 * 1024 * 1024;
  const total = file.size;
  const totalParts = Math.ceil(total / PART_SIZE);
  const parts = [];
  let assignedPart = 0;
  let uploadedBytes = 0;
  const uploadErrors = [];

  const workers = Array.from({ length: Math.max(1, concurrency) }, () =>
    (async () => {
      try {
        for (;;) {
          if (assignedPart >= totalParts) {
            break;
          }

          const currentIndex = assignedPart;
          assignedPart += 1;

          const partNumber = currentIndex + 1;
          const start = currentIndex * PART_SIZE;
          const end = Math.min(start + PART_SIZE, total);
          const Body = file.slice(start, end);

          const command = new UploadPartCommand({
            Bucket: bucket,
            Key: key,
            UploadId,
            PartNumber: partNumber,
            Body,
          });

          const { ETag } = await s3.send(command);
          parts.push({ ETag, PartNumber: partNumber });

          uploadedBytes += end - start;
          if (typeof onProgress === "function") {
            onProgress(Math.min(1, uploadedBytes / total));
          }
        }
      } catch (err) {
        uploadErrors.push(err);
        assignedPart = totalParts;
      }
    })()
  );

  try {
    await Promise.all(workers);

    if (uploadErrors.length > 0) {
      throw uploadErrors[0];
    }

    parts.sort((a, b) => a.PartNumber - b.PartNumber);

    const completeCommand = new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId,
      MultipartUpload: { Parts: parts },
    });

    await s3.send(completeCommand);
  } catch (err) {
    try {
      const abortCommand = new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId,
      });
      await s3.send(abortCommand);
    } catch (abortErr) {
      console.warn("Failed to abort multipart upload:", abortErr);
    }
    throw err;
  }
}

export function buildPublicUrl(bucket, key, template) {
  const baseTemplate = (template || `https://${bucket}.r2.dev`).replace(
    /\{bucket\}/g,
    bucket
  );
  const sanitizedBase = baseTemplate.replace(/\/$/, "");
  const encodedKey = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${sanitizedBase}/${encodedKey}`;
}
