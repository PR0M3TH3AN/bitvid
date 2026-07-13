// Bundles Alby's Bitcoin Connect into a single self-contained ESM file that
// bitvid lazy-imports behind FEATURE_BITCOIN_CONNECT (docs/bitcoin-connect-plan.md).
// Mirrors the floating-ui vendor step in build-beacon.mjs. Pinned via the exact
// devDependency version in package.json.
import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entryPoint = path.join(repoRoot, "scripts/vendor/bitcoin-connect-entry.mjs");
const vendorDir = path.join(repoRoot, "vendor");
const outFile = path.join(vendorDir, "bitcoin-connect.bundle.min.js");
const licenseSrc = path.join(
  repoRoot,
  "node_modules/@getalby/bitcoin-connect/LICENSE",
);
const licenseOut = path.join(vendorDir, "bitcoin-connect.LICENSE");

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
  // @getalby/lightning-tools lazily `import('crypto')` for L402 macaroons — a
  // path bitvid never calls. Alias it to a browser shim so the bundle resolves.
  alias: {
    crypto: path.join(repoRoot, "scripts/vendor/crypto-shim.mjs"),
    "node:crypto": path.join(repoRoot, "scripts/vendor/crypto-shim.mjs"),
  },
  logLevel: "info",
});

try {
  await copyFile(licenseSrc, licenseOut);
} catch (error) {
  console.warn("[build-bitcoin-connect] could not copy LICENSE:", error.message);
}

console.log("[build-bitcoin-connect] wrote", path.relative(repoRoot, outFile));
