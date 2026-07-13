// Bundles blossom-client-sdk into a single self-contained ESM file that bitvid
// lazy-imports behind FEATURE_BLOSSOM_STORAGE (docs/blossom-plan.md, TODO #30).
// Mirrors the bitcoin-connect / floating-ui vendor steps. Pinned via the exact
// devDependency version in package.json.
import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entryPoint = path.join(repoRoot, "scripts/vendor/blossom-sdk-entry.mjs");
const vendorDir = path.join(repoRoot, "vendor");
const outFile = path.join(vendorDir, "blossom-client-sdk.bundle.min.js");
const licenseSrc = path.join(
  repoRoot,
  "node_modules/blossom-client-sdk/LICENSE.txt",
);
const licenseOut = path.join(vendorDir, "blossom-client-sdk.LICENSE");

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
  // @cashu/cashu-ts is an OPTIONAL peer dep the SDK only lazy-imports on the
  // BUD-07 payment branch (HTTP 402). bitvid uses free Blossom servers, so alias
  // it to a throwing stub instead of pulling the dep.
  alias: {
    "@cashu/cashu-ts": path.join(repoRoot, "scripts/vendor/cashu-stub.mjs"),
  },
  logLevel: "info",
});

try {
  await copyFile(licenseSrc, licenseOut);
} catch (error) {
  console.warn("[build-blossom-sdk] could not copy LICENSE:", error.message);
}

console.log("[build-blossom-sdk] wrote", path.relative(repoRoot, outFile));
