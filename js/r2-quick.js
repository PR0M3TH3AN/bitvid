import { buildR2Key, buildPublicUrl } from "./r2.js";
import {
  sanitizeBucketName,
  ensureBucket,
  putCors,
  attachCustomDomainAndWait,
  setManagedDomain,
} from "./storage/r2-mgmt.js";
import { makeR2Client, multipartUpload } from "./storage/r2-s3.js";

const STORAGE_KEY = "bitvid:quickR2Settings";
const STATUS_CLASSNAMES = [
  "text-status-neutral",
  "text-status-info",
  "text-status-success",
  "text-status-danger",
  "text-status-warning",
];
const STATUS_TONES = {
  info: "text-status-info",
  success: "text-status-success",
  error: "text-status-danger",
  warning: "text-status-warning",
};

function sanitizeDomain(value) {
  if (!value) {
    return "";
  }
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

function loadSavedSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn("Failed to read quick R2 settings:", err);
    return null;
  }
}

function persistSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn("Failed to store quick R2 settings:", err);
  }
}

function clearSavedSettings() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn("Failed to clear quick R2 settings:", err);
  }
}

function setStatus(el, message, tone = "info") {
  if (!el) {
    return;
  }
  STATUS_CLASSNAMES.forEach((cls) => el.classList.remove(cls));
  const className = STATUS_TONES[tone] || "text-status-neutral";
  if (className) {
    el.classList.add(className);
  }
  el.textContent = message || "";
}

function setUploadingState(elements, uploading) {
  const disabled = Boolean(uploading);
  elements.forEach((el) => {
    if (el) {
      el.disabled = disabled;
    }
  });
}

function getCorsOrigins() {
  const origins = new Set();
  if (typeof window !== "undefined" && window.location) {
    const origin = window.location.origin;
    if (origin && origin !== "null") {
      origins.add(origin);
    }
    if (origin && origin.startsWith("http://")) {
      origins.add(origin.replace("http://", "https://"));
    }
  }
  origins.add("http://localhost:8000");
  origins.add("http://127.0.0.1:8000");
  return Array.from(origins);
}

function buildQuickKey(title, file, npub) {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10);
  const baseName = (title || file?.name || "video")
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const safeBase = baseName || "video";
  const originalName = typeof file?.name === "string" ? file.name : "";
  const extMatch = originalName.match(/\.([^.]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : "mp4";
  const sanitizedNpub = String(npub || "user").replace(/[^a-z0-9]/gi, "");
  return `videos/${datePart}/${sanitizedNpub || "user"}-${safeBase}.${ext}`;
}

export function initQuickR2Upload(app) {
  const section = document.getElementById("quickR2Section");
  if (!section) {
    return;
  }

  const elements = {
    accountId: document.getElementById("quickR2AccountId"),
    accessKeyId: document.getElementById("quickR2AccessKeyId"),
    secretAccessKey: document.getElementById("quickR2SecretAccessKey"),
    apiToken: document.getElementById("quickR2ApiToken"),
    customDomain: document.getElementById("quickR2CustomDomain"),
    zoneId: document.getElementById("quickR2ZoneId"),
    remember: document.getElementById("quickR2Remember"),
    allowManaged: document.getElementById("quickR2AllowManaged"),
    file: document.getElementById("quickR2File"),
    uploadButton: document.getElementById("quickR2UploadButton"),
    status: document.getElementById("quickR2Status"),
    hostedUrl: document.getElementById("uploadUrl"),
    titleInput: document.getElementById("uploadTitle"),
    form: document.getElementById("uploadForm"),
  };

  const saved = loadSavedSettings();
  if (saved && saved.remember) {
    if (elements.accountId) elements.accountId.value = saved.accountId || "";
    if (elements.accessKeyId)
      elements.accessKeyId.value = saved.accessKeyId || "";
    if (elements.secretAccessKey)
      elements.secretAccessKey.value = saved.secretAccessKey || "";
    if (elements.apiToken) elements.apiToken.value = saved.apiToken || "";
    if (elements.customDomain)
      elements.customDomain.value = saved.customDomain || "";
    if (elements.zoneId) elements.zoneId.value = saved.zoneId || "";
    if (elements.allowManaged)
      elements.allowManaged.checked = Boolean(saved.allowManaged ?? true);
    if (elements.remember) elements.remember.checked = true;
  }

  function maybePersist() {
    if (!elements.remember) {
      return;
    }
    if (elements.remember.checked) {
      persistSettings({
        remember: true,
        accountId: elements.accountId?.value?.trim() || "",
        accessKeyId: elements.accessKeyId?.value?.trim() || "",
        secretAccessKey: elements.secretAccessKey?.value?.trim() || "",
        apiToken: elements.apiToken?.value?.trim() || "",
        customDomain: elements.customDomain?.value?.trim() || "",
        zoneId: elements.zoneId?.value?.trim() || "",
        allowManaged: Boolean(elements.allowManaged?.checked ?? true),
      });
    } else {
      clearSavedSettings();
    }
  }

  elements.remember?.addEventListener("change", () => {
    if (!elements.remember.checked) {
      clearSavedSettings();
    }
  });

  async function handleUpload() {
    const file = elements.file?.files?.[0] || null;
    if (!file) {
      setStatus(elements.status, "Choose a file to upload.", "error");
      return;
    }

    const accountId = elements.accountId?.value?.trim();
    const accessKeyId = elements.accessKeyId?.value?.trim();
    const secretAccessKey = elements.secretAccessKey?.value?.trim();
    const apiToken = elements.apiToken?.value?.trim();
    const customDomain = sanitizeDomain(
      elements.customDomain?.value || ""
    );
    const zoneId = elements.zoneId?.value?.trim();
    const allowManaged = Boolean(elements.allowManaged?.checked ?? true);

    if (!accountId || !accessKeyId || !secretAccessKey) {
      setStatus(
        elements.status,
        "Account ID and S3 keys are required for Cloudflare R2.",
        "error"
      );
      return;
    }

    const npub =
      typeof app?.safeEncodeNpub === "function" ? app.safeEncodeNpub(app.pubkey) : null;
    if (!npub) {
      setStatus(
        elements.status,
        "Unable to derive your npub. Connect a Nostr key first.",
        "error"
      );
      return;
    }

    maybePersist();

    const bucket = sanitizeBucketName(npub);
    const inputsToDisable = [
      elements.accountId,
      elements.accessKeyId,
      elements.secretAccessKey,
      elements.apiToken,
      elements.customDomain,
      elements.zoneId,
      elements.remember,
      elements.allowManaged,
      elements.file,
      elements.uploadButton,
    ];

    setUploadingState(inputsToDisable, true);
    setStatus(elements.status, `Preparing bucket ${bucket}…`, "info");

    try {
      if (apiToken) {
        try {
          await ensureBucket({ accountId, bucket, token: apiToken });
        } catch (err) {
          throw new Error(
            err?.message ? `Bucket setup failed: ${err.message}` : "Bucket setup failed."
          );
        }

        try {
          await putCors({
            accountId,
            bucket,
            token: apiToken,
            origins: getCorsOrigins(),
          });
        } catch (corsErr) {
          console.warn("Quick R2 CORS update failed:", corsErr);
        }
      }

      let publicBaseUrl = "";
      let usedManagedFallback = false;

      if (customDomain) {
        if (apiToken && zoneId) {
          try {
            setStatus(
              elements.status,
              `Attaching ${customDomain}…`,
              "info"
            );
            const custom = await attachCustomDomainAndWait({
              accountId,
              bucket,
              token: apiToken,
              zoneId,
              domain: customDomain,
              pollInterval: 1500,
              timeoutMs: 120000,
            });
            if (custom?.active && custom?.url) {
              publicBaseUrl = custom.url;
              try {
                await setManagedDomain({
                  accountId,
                  bucket,
                  token: apiToken,
                  enabled: false,
                });
              } catch (disableErr) {
                console.warn("Quick R2 managed domain disable failed:", disableErr);
              }
            } else {
              setStatus(
                elements.status,
                `Custom domain pending (${custom?.status || "unknown"}).`,
                "warning"
              );
            }
          } catch (err) {
            console.warn("Quick R2 custom domain error:", err);
            setStatus(
              elements.status,
              err?.message
                ? `Custom domain setup failed: ${err.message}`
                : "Custom domain setup failed.",
              "warning"
            );
          }
        }

        if (!publicBaseUrl) {
          publicBaseUrl = `https://${customDomain}`;
        }
      }

      if (!publicBaseUrl && apiToken && allowManaged) {
        try {
          setStatus(elements.status, "Enabling managed r2.dev domain…", "info");
          const managed = await setManagedDomain({
            accountId,
            bucket,
            token: apiToken,
            enabled: true,
          });
          if (managed?.url) {
            publicBaseUrl = managed.url;
            usedManagedFallback = true;
          }
        } catch (err) {
          console.warn("Quick R2 managed domain enable failed:", err);
          setStatus(
            elements.status,
            err?.message
              ? `Managed domain failed: ${err.message}`
              : "Managed domain failed.",
            "warning"
          );
        }
      }

      if (!publicBaseUrl) {
        throw new Error(
          "No public domain configured. Provide a custom domain or allow the managed r2.dev fallback."
        );
      }

      const s3 = makeR2Client({ accountId, accessKeyId, secretAccessKey });
      const title = elements.titleInput?.value?.trim() || "";
      const key = buildQuickKey(title, file, npub) || buildR2Key(npub, file);
      const hostedUrl = buildPublicUrl(publicBaseUrl, key);

      let lastPercent = -1;
      setStatus(elements.status, `Uploading… 0%`, usedManagedFallback ? "warning" : "info");

      await multipartUpload({
        s3,
        bucket,
        key,
        file,
        contentType: file.type,
        onProgress: (fraction) => {
          if (typeof fraction !== "number" || !isFinite(fraction)) {
            return;
          }
          const percent = Math.max(0, Math.min(100, Math.round(fraction * 100)));
          if (percent !== lastPercent) {
            lastPercent = percent;
            setStatus(
              elements.status,
              `Uploading… ${percent}%`,
              usedManagedFallback ? "warning" : "info"
            );
          }
        },
      });

      if (elements.hostedUrl) {
        elements.hostedUrl.value = hostedUrl;
      }

      setStatus(
        elements.status,
        `Upload complete. Hosted URL set to ${hostedUrl}.`,
        "success"
      );

      if (elements.form && typeof elements.form.requestSubmit === "function") {
        elements.form.requestSubmit();
      }
    } catch (err) {
      console.error("Quick R2 upload failed:", err);
      setStatus(
        elements.status,
        err?.message ? `Upload failed: ${err.message}` : "Upload failed.",
        "error"
      );
    } finally {
      setUploadingState(inputsToDisable, false);
    }
  }

  elements.uploadButton?.addEventListener("click", () => {
    handleUpload();
  });
}

export default initQuickR2Upload;
