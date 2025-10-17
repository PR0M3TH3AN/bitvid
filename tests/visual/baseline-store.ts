import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type KitchenSinkTheme = "default" | "light" | "contrast";

export type BaselineKey = KitchenSinkTheme | "video-modal-mobile";

type BaselineMap = Record<string, string>;

const BASELINE_FILE_PATH = resolve(__dirname, "baselines.json");

let dirty = false;

let baselines: BaselineMap;
const baselineFileContents = readFileSync(BASELINE_FILE_PATH, "utf-8");

try {
  baselines = JSON.parse(baselineFileContents);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`Invalid JSON in ${BASELINE_FILE_PATH}: ${message}`);
}

export function getBaseline(key: BaselineKey): Buffer {
  const base64 = baselines[key];

  if (!base64) {
    throw new Error(`Missing baseline for theme: ${key}`);
  }

  return Buffer.from(base64, "base64");
}

export function setBaseline(key: BaselineKey, baseline: Buffer): void {
  baselines[key] = baseline.toString("base64");
  dirty = true;
}

export function saveBaselines(): void {
  if (!dirty) {
    return;
  }

  writeFileSync(BASELINE_FILE_PATH, `${JSON.stringify(baselines, null, 2)}\n`);
  dirty = false;
}
