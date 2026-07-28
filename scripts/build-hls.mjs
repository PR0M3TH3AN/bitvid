// Bundles hls.js into a single self-contained ESM file that bitvid lazy-imports
// the first time a viewer opens an HLS (.m3u8) source. Mirrors the
// blossom-sdk / bitcoin-connect / floating-ui vendor steps. Pinned via the exact
// devDependency version in package.json.
//
// Lazy-import is the whole point: hls.js is ~530KB minified, and the vast
// majority of bitvid videos are progressive MP4 or WebTorrent. Nothing here may
// be imported from a module that loads on boot.
import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entryPoint = path.join(repoRoot, "scripts/vendor/hls-entry.mjs");
const vendorDir = path.join(repoRoot, "vendor");
const outFile = path.join(vendorDir, "hls.bundle.min.js");
const licenseSrc = path.join(repoRoot, "node_modules/hls.js/LICENSE");
const licenseOut = path.join(vendorDir, "hls.LICENSE");

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
  define: {
    "process.env.NODE_ENV": '"production"',
    global: "globalThis",
  },
  logLevel: "info",
});

try {
  await copyFile(licenseSrc, licenseOut);
} catch (error) {
  console.warn("[build-hls] could not copy LICENSE:", error.message);
}

console.log("[build-hls] wrote", path.relative(repoRoot, outFile));
