import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export type KitchenSinkTheme = "default" | "light" | "contrast";

export type BaselineKey =
  | KitchenSinkTheme
  | "video-modal-mobile-legacy"
  | "video-modal-mobile-design-system";

type BaselineMap = Record<string, string>;

const BASELINE_FILE_PATH = resolve(__dirname, "baselines.json");

let dirty = false;
const baselines: BaselineMap = JSON.parse(
  readFileSync(BASELINE_FILE_PATH, "utf-8")
);

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
