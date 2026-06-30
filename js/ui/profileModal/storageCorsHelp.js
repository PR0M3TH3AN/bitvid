// Storage CORS setup helper (all bucket providers).
//
// Browser uploads to a bucket use an S3 PUT/POST, which the bucket must allow via
// CORS. bitvid tries to set this for you on Save, but that needs a key with CORS-write
// permission and a provider that allows it (Backblaze B2's web presets, for example,
// only "share" downloads). This module renders a small, PROVIDER-AWARE modal with the
// exact rules (origins pre-filled) + how to apply them for the selected provider.

import { devLogger } from "../../utils/logger.js";
import { deriveB2Endpoint, getCorsOrigins } from "../../services/s3Service.js";

const PROVIDER_B2 = "backblaze_b2";
const PROVIDER_R2 = "cloudflare_r2";

// Backblaze B2 native rules (corsRuleName + allowedOperations). The web-console
// presets omit the upload operations (s3_put/s3_post), which is why uploads fail.
export function buildBucketCorsRules(origins) {
  const allowedOrigins =
    Array.isArray(origins) && origins.length ? origins : ["*"];
  return [
    {
      corsRuleName: "bitvidBrowserAccess",
      allowedOrigins,
      allowedHeaders: ["*"],
      allowedOperations: ["s3_head", "s3_get", "s3_put", "s3_post", "s3_delete"],
      exposeHeaders: ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
      maxAgeSeconds: 3600,
    },
  ];
}

// Standard S3 CORSConfiguration — accepted by the AWS CLI, S3-compatible provider
// dashboards, and Cloudflare R2's CORS-policy editor. (OPTIONS is implicit in S3 CORS
// and not a valid AllowedMethod, so it's omitted on purpose.)
export function buildS3CorsConfig(origins) {
  const allowedOrigins =
    Array.isArray(origins) && origins.length ? origins : ["*"];
  return {
    CORSRules: [
      {
        AllowedOrigins: allowedOrigins,
        AllowedMethods: ["GET", "HEAD", "PUT", "POST", "DELETE"],
        AllowedHeaders: ["*"],
        ExposeHeaders: ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
        MaxAgeSeconds: 3600,
      },
    ],
  };
}

// B2 CLI command (the path B2's web console points custom-rule users to).
export function buildB2CorsCommand(bucket, rules) {
  const bucketName = (bucket && bucket.trim()) || "YOUR_BUCKET";
  return `b2 update-bucket --corsRules '${JSON.stringify(rules)}' ${bucketName} allPublic`;
}

// AWS CLI command against the provider's S3 endpoint (works for Custom S3 and R2).
export function buildAwsCorsCommand(bucket, endpoint, config) {
  const bucketName = (bucket && bucket.trim()) || "YOUR_BUCKET";
  const ep = endpoint && endpoint.trim() ? ` --endpoint-url ${endpoint.trim()}` : "";
  return `aws s3api put-bucket-cors --bucket ${bucketName}${ep} --cors-configuration '${JSON.stringify(config)}'`;
}

function resolveEndpointForCors(provider, region, rawEndpoint) {
  if (provider === PROVIDER_B2) {
    return deriveB2Endpoint(region);
  }
  if (provider === PROVIDER_R2) {
    return rawEndpoint ? `https://${rawEndpoint}.r2.cloudflarestorage.com` : "";
  }
  return rawEndpoint || "";
}

// Build the provider-specific modal content (intro / JSON / command + label / notes).
export function buildCorsHelpContent({ provider, origins, bucket, endpoint } = {}) {
  if (provider === PROVIDER_B2) {
    const rules = buildBucketCorsRules(origins);
    return {
      intro:
        "Backblaze B2's web-console CORS presets (\"Share everything…\") only allow " +
        "downloads. Uploading from your browser needs the custom rules below, applied " +
        "with B2's command-line tool.",
      json: JSON.stringify(rules, null, 2),
      cmdLabel: "Apply it (B2 command-line tool)",
      cmd: buildB2CorsCommand(bucket, rules),
      notes:
        "1. Install the B2 CLI (pip install b2).\n" +
        "2. Run the command above (it authorizes, then sets the rules).\n" +
        "3. Wait ~1 minute, then retry your upload.\n" +
        "Tip: a B2 application key with the writeBucketCors capability lets bitvid set " +
        "this for you automatically on Save.",
    };
  }

  const isR2 = provider === PROVIDER_R2;
  const config = buildS3CorsConfig(origins);
  return {
    intro:
      "bitvid tries to set CORS for you when you Save. If uploads still fail (the key " +
      "lacks CORS-write permission, or your provider needs it set manually), apply the " +
      "rules below.",
    json: JSON.stringify(config, null, 2),
    cmdLabel: isR2
      ? "Apply it (Cloudflare dashboard, or AWS CLI)"
      : "Apply it (provider dashboard, or AWS CLI)",
    cmd: buildAwsCorsCommand(bucket, endpoint, config),
    notes: isR2
      ? "Cloudflare dashboard: R2 → your bucket → Settings → CORS Policy → paste the JSON.\n" +
        "Or run the AWS CLI command above (it targets your R2 endpoint)."
      : "Paste the JSON into your provider's bucket CORS settings, or run the AWS CLI " +
        "command above against your endpoint.",
  };
}

export class StorageCorsHelp {
  constructor({ getProvider, getBucket, getRegion, getEndpoint } = {}) {
    this.getProvider = typeof getProvider === "function" ? getProvider : () => "";
    this.getBucket = typeof getBucket === "function" ? getBucket : () => "";
    this.getRegion = typeof getRegion === "function" ? getRegion : () => "";
    this.getEndpoint = typeof getEndpoint === "function" ? getEndpoint : () => "";
    this.helpBtn = null;
    this.modal = null;
    this.introEl = null;
    this.jsonEl = null;
    this.cliEl = null;
    this.cmdLabelEl = null;
    this.notesEl = null;
    this.copyJsonBtn = null;
    this.copyCmdBtn = null;
  }

  cacheDom(doc = document) {
    this.helpBtn = doc.getElementById("storageCorsHelpBtn") || null;
    this.modal = doc.getElementById("storageCorsModal") || null;
    this.introEl = doc.getElementById("storageCorsModalIntro") || null;
    this.jsonEl = doc.getElementById("storageCorsJson") || null;
    this.cliEl = doc.getElementById("storageCorsCli") || null;
    this.cmdLabelEl = doc.getElementById("storageCorsCmdLabel") || null;
    this.notesEl = doc.getElementById("storageCorsNotes") || null;
    this.copyJsonBtn = doc.getElementById("storageCorsCopyJsonBtn") || null;
    this.copyCmdBtn = doc.getElementById("storageCorsCopyCmdBtn") || null;
  }

  registerEventListeners() {
    if (this.helpBtn instanceof HTMLElement) {
      this.helpBtn.addEventListener("click", () => this.open());
    }
    if (this.modal instanceof HTMLElement) {
      this.modal
        .querySelectorAll("[data-storage-cors-dismiss]")
        .forEach((el) => el.addEventListener("click", () => this.close()));
      this.modal.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          this.close();
        }
      });
    }
    if (this.copyJsonBtn instanceof HTMLElement) {
      this.copyJsonBtn.addEventListener("click", () => {
        void this.copy(this.jsonEl?.textContent, this.copyJsonBtn, "Copy JSON");
      });
    }
    if (this.copyCmdBtn instanceof HTMLElement) {
      this.copyCmdBtn.addEventListener("click", () => {
        void this.copy(this.cliEl?.textContent, this.copyCmdBtn, "Copy command");
      });
    }
  }

  setVisible(show) {
    if (this.helpBtn instanceof HTMLElement) {
      this.helpBtn.classList.toggle("hidden", !show);
    }
  }

  open() {
    if (!(this.modal instanceof HTMLElement)) {
      return;
    }
    let origins = [];
    try {
      origins = getCorsOrigins();
    } catch (error) {
      origins = [];
    }
    const provider = this.getProvider();
    const content = buildCorsHelpContent({
      provider,
      origins,
      bucket: this.getBucket(),
      endpoint: resolveEndpointForCors(provider, this.getRegion(), this.getEndpoint()),
    });

    if (this.introEl) this.introEl.textContent = content.intro;
    if (this.jsonEl) this.jsonEl.textContent = content.json;
    if (this.cmdLabelEl) this.cmdLabelEl.textContent = content.cmdLabel;
    if (this.cliEl) this.cliEl.textContent = content.cmd;
    if (this.notesEl) this.notesEl.textContent = content.notes;

    this.modal.classList.remove("hidden");
    const sheet = this.modal.querySelector(".modal-sheet");
    if (sheet instanceof HTMLElement) {
      sheet.focus();
    }
  }

  close() {
    if (this.modal instanceof HTMLElement) {
      this.modal.classList.add("hidden");
    }
    if (this.helpBtn instanceof HTMLElement) {
      this.helpBtn.focus();
    }
  }

  async copy(text, button, restoreLabel) {
    const value = typeof text === "string" ? text : "";
    if (!value || !navigator?.clipboard?.writeText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      if (button instanceof HTMLElement) {
        button.textContent = "Copied!";
        setTimeout(() => {
          button.textContent = restoreLabel;
        }, 1500);
      }
    } catch (error) {
      devLogger.warn("[ProfileModal] Failed to copy CORS text:", error);
    }
  }
}
