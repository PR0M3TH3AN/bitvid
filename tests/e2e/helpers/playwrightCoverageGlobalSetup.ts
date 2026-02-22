import type { FullConfig } from "@playwright/test";
import { prepareCoverageArtifactsDir } from "./playwrightCoverageInstrumentation";

export default async function globalSetup(_config: FullConfig): Promise<void> {
  await prepareCoverageArtifactsDir();
}
