import { expect, test } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import {
  getBaseline,
  saveBaselines,
  setBaseline,
  type KitchenSinkTheme
} from "./baseline-store";

const THEMES: { name: KitchenSinkTheme; value?: string }[] = [
  { name: "default" },
  { name: "light", value: "light" },
  { name: "contrast", value: "contrast" }
];

const MAX_DIFF_RATIO = 0.001;
const UPDATE_BASELINES = process.env.UPDATE_VISUAL_BASELINES === "1";

test.describe.configure({ mode: "serial" });

test.use({
  viewport: { width: 1280, height: 720 }
});

test.describe("design system kitchen sink", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test.afterAll(async () => {
    if (UPDATE_BASELINES) {
      saveBaselines();
    }
  });

  for (const theme of THEMES) {
    test(`renders ${theme.name} theme without regressions`, async ({
      page
    }, testInfo) => {
      await page.goto("/docs/kitchen-sink.html", { waitUntil: "networkidle" });

      await page.addStyleTag({
        content:
          "*, *::before, *::after { transition-duration: 0s !important; animation-duration: 0s !important; animation-delay: 0s !important; caret-color: transparent !important; }"
      });

      await page.evaluate((value) => {
        const root = document.documentElement;
        const storageKey = "bitvid-docs-theme";

        if (!value) {
          root.removeAttribute("data-theme");
          window.localStorage.removeItem(storageKey);
        } else {
          root.setAttribute("data-theme", value);
          window.localStorage.setItem(storageKey, value);
        }
      }, theme.value ?? null);

      await page.waitForTimeout(100);

      const screenshotBuffer = await page.screenshot({
        type: "png",
        fullPage: true,
        animations: "disabled"
      });

      if (UPDATE_BASELINES) {
        setBaseline(theme.name, screenshotBuffer);
        await testInfo.attach(`${theme.name}-actual.png`, {
          body: screenshotBuffer,
          contentType: "image/png"
        });
        return;
      }

      const baselineBuffer = getBaseline(theme.name);
      const actual = PNG.sync.read(screenshotBuffer);
      const expected = PNG.sync.read(baselineBuffer);

      expect(actual.width).toBe(expected.width);
      expect(actual.height).toBe(expected.height);

      const diff = new PNG({ width: actual.width, height: actual.height });
      const diffPixelCount = pixelmatch(
        actual.data,
        expected.data,
        diff.data,
        actual.width,
        actual.height,
        { threshold: 0.1 }
      );

      const diffRatio = diffPixelCount / (actual.width * actual.height);

      if (diffPixelCount > 0) {
        await testInfo.attach(`${theme.name}-actual.png`, {
          body: screenshotBuffer,
          contentType: "image/png"
        });
        await testInfo.attach(`${theme.name}-baseline.png`, {
          body: baselineBuffer,
          contentType: "image/png"
        });
        await testInfo.attach(`${theme.name}-diff.png`, {
          body: PNG.sync.write(diff),
          contentType: "image/png"
        });
      }

      expect(diffRatio).toBeLessThanOrEqual(MAX_DIFF_RATIO);
    });
  }
});
