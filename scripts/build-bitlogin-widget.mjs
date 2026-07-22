// Vendor the sibling @bitlogin/widget build into a pinned, same-origin bundle.
//
// bitvid's CSP is script-src 'self' (plus a couple of pinned CDN fallbacks for
// nostr-tools) -- the same reasoning as the existing bitcoin-connect/blossom-sdk
// vendor steps. Unlike those, BitLogin ships its own Vite-built ESM output
// directly (bitlogin.js + cryptoWorker.js + a shared chunk they both import),
// so this script copies that output verbatim instead of re-bundling it with
// esbuild -- the worker's relative self-URL resolution depends on the three
// files staying exactly as built and sitting side by side (see BitRoad's and
// BitUnlock's identical vendor steps for this same reasoning).
//
//   node scripts/build-bitlogin-widget.mjs
//   BITLOGIN_ENTRY=/path/to/bitlogin node scripts/build-bitlogin-widget.mjs

import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bitloginRoot = process.env.BITLOGIN_ENTRY
  ? path.resolve(process.env.BITLOGIN_ENTRY)
  : path.resolve(repoRoot, "../bitlogin");
const widgetDir = path.join(bitloginRoot, "packages/widget");
const widgetDist = path.join(widgetDir, "dist");
const vendorDir = path.join(repoRoot, "vendor/bitlogin");
const integrityFile = path.join(repoRoot, "vendor/bitlogin.integrity.json");

const packageJson = JSON.parse(await readFile(path.join(widgetDir, "package.json"), "utf8"));
if (packageJson.name !== "@bitlogin/widget") {
  throw new Error("BITLOGIN_ENTRY must point to a BitLogin checkout (packages/widget/package.json not found there).");
}

if (!existsSync(widgetDist)) {
  console.log("[build-bitlogin-widget] dist missing, building @bitlogin/core then @bitlogin/widget first...");
  execSync("npm run build -w @bitlogin/core", { cwd: bitloginRoot, stdio: "inherit" });
  execSync("npm run build -w @bitlogin/widget", { cwd: bitloginRoot, stdio: "inherit" });
}

await rm(vendorDir, { recursive: true, force: true });
await mkdir(vendorDir, { recursive: true });

const distEntries = (await readdir(widgetDist)).filter((name) => name.endsWith(".js"));
if (!distEntries.includes("bitlogin.js") || !distEntries.includes("cryptoWorker.js")) {
  throw new Error("Expected bitlogin.js and cryptoWorker.js in @bitlogin/widget dist -- did the build layout change?");
}

const files = {};
for (const name of distEntries) {
  await copyFile(path.join(widgetDist, name), path.join(vendorDir, name));
  const bytes = await readFile(path.join(widgetDist, name));
  files[name] = { sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength };
}

await writeFile(
  integrityFile,
  `${JSON.stringify({ package: packageJson.name, version: packageJson.version, files }, null, 2)}\n`,
);

try {
  await copyFile(path.join(bitloginRoot, "LICENSE"), path.join(repoRoot, "vendor/bitlogin.LICENSE"));
} catch (error) {
  console.warn("[build-bitlogin-widget] could not copy LICENSE:", error.message);
}

console.log("[build-bitlogin-widget] wrote", path.relative(repoRoot, vendorDir), `(${distEntries.length} files)`);
