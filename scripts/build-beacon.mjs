#!/usr/bin/env node

import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const entryPoint = path.join(repoRoot, "torrent/src/beacon-vendor.js");
const outDir = path.join(repoRoot, "torrent/dist");
const outFile = path.join(outDir, "beacon.js");

await mkdir(outDir, { recursive: true });

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
