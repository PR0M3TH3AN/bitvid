#!/usr/bin/env node

import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const entryPoint = path.join(repoRoot, "torrent/src/beacon-vendor.js");
const outDir = path.join(repoRoot, "torrent/dist");
const outFile = path.join(outDir, "beacon.js");
const vendorDir = path.join(repoRoot, "vendor");
const vendorOutFile = path.join(vendorDir, "floating-ui.dom.bundle.min.js");
const vendorLicenseFile = path.join(vendorDir, "floating-ui.LICENSE");
const floatingUiEntry = path.join(
  repoRoot,
  "scripts/vendor/floating-ui-dom-entry.mjs",
);

const require = createRequire(import.meta.url);
const floatingUiPackageJson = require.resolve("@floating-ui/dom/package.json");
const floatingUiLicense = path.join(
  path.dirname(floatingUiPackageJson),
  "LICENSE",
);

await mkdir(outDir, { recursive: true });
await mkdir(vendorDir, { recursive: true });

await build({
  bundle: true,
  entryPoints: [entryPoint],
  outfile: outFile,
  format: "esm",
  splitting: false,
  platform: "browser",
  target: ["es2020"],
  minify: true,
  sourcemap: false,
  loader: {
    ".css": "css",
    ".woff": "dataurl",
    ".woff2": "dataurl",
    ".ttf": "dataurl",
    ".eot": "dataurl",
    ".svg": "dataurl",
  },
  logLevel: "info",
});

await build({
  bundle: true,
  entryPoints: [floatingUiEntry],
  outfile: vendorOutFile,
  format: "esm",
  splitting: false,
  platform: "browser",
  target: ["es2020"],
  minify: true,
  sourcemap: false,
  logLevel: "info",
});

await copyFile(floatingUiLicense, vendorLicenseFile);
