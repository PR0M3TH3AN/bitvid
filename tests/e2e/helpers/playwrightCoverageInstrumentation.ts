import fs from "node:fs/promises";
import path from "node:path";
import type { Page, TestInfo } from "@playwright/test";

type ConsoleEntry = {
  type: string;
  text: string;
  location?: {
    url?: string;
    lineNumber?: number;
    columnNumber?: number;
  };
};

type PageErrorEntry = {
  message: string;
  stack?: string;
};

type CoverageEntry = {
  url: string;
  text: string;
  functions: Array<{
    functionName: string;
    isBlockCoverage: boolean;
    ranges: Array<{ startOffset: number; endOffset: number; count: number }>;
  }>;
};

function sanitizeSegment(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function getRawArtifactDir(): string {
  return path.join(process.cwd(), "artifacts", "playwright-coverage", "raw");
}

export async function prepareCoverageArtifactsDir(): Promise<void> {
  if (process.env.PLAYWRIGHT_COVERAGE !== "1") return;
  const dir = getRawArtifactDir();
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

export async function attachCoverageAndConsoleCapture(
  page: Page,
  testInfo: TestInfo,
  browserName: string,
): Promise<() => Promise<void>> {
  const captureCoverage = process.env.PLAYWRIGHT_COVERAGE === "1";
  const captureConsole = process.env.PLAYWRIGHT_CAPTURE_CONSOLE === "1" || captureCoverage;
  const rawDir = getRawArtifactDir();

  const consoleEntries: ConsoleEntry[] = [];
  const pageErrors: PageErrorEntry[] = [];
  let coverageStarted = false;

  const onConsole = (message: any) => {
    consoleEntries.push({
      type: message.type(),
      text: message.text(),
      location: message.location(),
    });
  };

  const onPageError = (error: Error) => {
    pageErrors.push({
      message: error?.message || String(error),
      stack: error?.stack,
    });
  };

  if (captureConsole) {
    page.on("console", onConsole);
    page.on("pageerror", onPageError);
  }

  if (captureCoverage && browserName === "chromium") {
    await page.coverage.startJSCoverage({
      resetOnNavigation: false,
      reportAnonymousScripts: false,
    });
    coverageStarted = true;
  }

  return async () => {
    const timestamp = new Date().toISOString();
    const testId = sanitizeSegment(
      `${testInfo.project.name}-${testInfo.titlePath.join(" ")}-retry-${testInfo.retry}`,
    );

    page.off("console", onConsole);
    page.off("pageerror", onPageError);

    let coverage: CoverageEntry[] = [];
    if (coverageStarted) {
      coverage = (await page.coverage.stopJSCoverage()) as CoverageEntry[];
    }

    if (!captureCoverage && !captureConsole) return;

    await fs.mkdir(rawDir, { recursive: true });
    await fs.writeFile(
      path.join(rawDir, `${testId}.json`),
      JSON.stringify(
        {
          timestamp,
          project: testInfo.project.name,
          title: testInfo.title,
          titlePath: testInfo.titlePath,
          file: testInfo.file,
          retry: testInfo.retry,
          status: testInfo.status,
          expectedStatus: testInfo.expectedStatus,
          browserName,
          logs: consoleEntries,
          pageErrors,
          coverage,
        },
        null,
        2,
      ),
      "utf8",
    );
  };
}
