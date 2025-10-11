import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export type KitchenSinkTheme = "default" | "light" | "contrast";

type BaselineMap = Record<KitchenSinkTheme, string>;

const BASELINE_FILE_PATH = resolve(__dirname, "baselines.json");

let dirty = false;
const baselines: BaselineMap = JSON.parse(
  readFileSync(BASELINE_FILE_PATH, "utf-8")
);

export function getBaseline(theme: KitchenSinkTheme): Buffer {
  const base64 = baselines[theme];

  if (!base64) {
    throw new Error(`Missing baseline for theme: ${theme}`);
  }

  return Buffer.from(base64, "base64");
}

export function setBaseline(theme: KitchenSinkTheme, baseline: Buffer): void {
  baselines[theme] = baseline.toString("base64");
  dirty = true;
}

export function saveBaselines(): void {
  if (!dirty) {
    return;
  }

  writeFileSync(BASELINE_FILE_PATH, `${JSON.stringify(baselines, null, 2)}\n`);
  dirty = false;
}
