// Storage CORS setup helper (B2 / S3-compatible providers).
//
// Browser uploads to a bucket use an S3 PUT/POST, which the bucket must allow via
// CORS. Backblaze B2's web-console presets only "share" (download) files, so uploads
// stay CORS-blocked until custom rules are applied with B2's CLI. This module renders
// a small modal with the exact rules (origins pre-filled) + the command to apply them.

import { devLogger } from "../../utils/logger.js";
import { getCorsOrigins } from "../../services/s3Service.js";

// The CORS rules bitvid needs for in-browser uploads + ranged playback, in B2's
// native rules shape. Mirrors ensureBucketCors (GET/HEAD/PUT/POST/DELETE + ranged-
// playback expose headers) but adds the upload operations the B2 web-console presets
// omit (they only share downloads).
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

// The exact B2 CLI command that applies the rules (the path B2's web console points
// custom-rule users to). Compact JSON so it pastes as one line.
export function buildB2CorsCommand(bucket, rules) {
  const bucketName = (bucket && bucket.trim()) || "YOUR_BUCKET";
  const compact = JSON.stringify(rules);
  return `b2 update-bucket --corsRules '${compact}' ${bucketName} allPublic`;
}

export class StorageCorsHelp {
  constructor({ getBucket } = {}) {
    this.getBucket = typeof getBucket === "function" ? getBucket : () => "";
    this.helpBtn = null;
    this.modal = null;
    this.jsonEl = null;
    this.cliEl = null;
    this.copyJsonBtn = null;
    this.copyCmdBtn = null;
  }

  cacheDom(doc = document) {
    this.helpBtn = doc.getElementById("storageCorsHelpBtn") || null;
    this.modal = doc.getElementById("storageCorsModal") || null;
    this.jsonEl = doc.getElementById("storageCorsJson") || null;
    this.cliEl = doc.getElementById("storageCorsCli") || null;
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

  // R2 auto-applies CORS via its own flow; the manual helper is for the S3-compatible
  // providers (B2 / Custom S3) where the bucket owner sets it.
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
    const rules = buildBucketCorsRules(origins);
    if (this.jsonEl) {
      this.jsonEl.textContent = JSON.stringify(rules, null, 2);
    }
    if (this.cliEl) {
      this.cliEl.textContent = buildB2CorsCommand(this.getBucket(), rules);
    }
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
