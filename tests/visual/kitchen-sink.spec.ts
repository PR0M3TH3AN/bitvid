import { expect, test } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import {
  getBaseline,
  saveBaselines,
  setBaseline,
  type BaselineKey,
  type KitchenSinkTheme
} from "./baseline-store";

const THEMES: { name: KitchenSinkTheme; value?: string }[] = [
  { name: "default" },
  { name: "light", value: "light" },
  { name: "contrast", value: "contrast" }
];

const VIDEO_MODAL_BASELINE_KEY = "video-modal-mobile" as BaselineKey;

const MAX_DIFF_RATIO = 0.001;
const UPDATE_BASELINES = process.env.UPDATE_VISUAL_BASELINES === "1";

test.describe.configure({ mode: "serial" });

test.use({
  viewport: { width: 1280, height: 720 }
});

test.afterAll(async () => {
  if (UPDATE_BASELINES) {
    saveBaselines();
  }
});

test.describe("design system kitchen sink", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  for (const theme of THEMES) {
    test(`renders ${theme.name} theme without regressions`, async ({
      page
    }, testInfo) => {
      await page.goto("/docs/kitchen-sink.html", { waitUntil: "networkidle" });

      await page.addStyleTag({
        content:
          "*, *::before, *::after { transition-duration: 0s !important; animation-duration: 0s !important; animation-delay: 0s !important; caret-color: transparent !important; } ::-webkit-scrollbar { display: none; } body { -ms-overflow-style: none; scrollbar-width: none; }"
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

test.describe("video modal mobile regression", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("renders video modal without regressions", async ({ page }, testInfo) => {
      await page.goto("/components/video-modal.html", {
        waitUntil: "networkidle"
      });

      await page.addStyleTag({
        content:
          "*, *::before, *::after { transition-duration: 0s !important; animation-duration: 0s !important; animation-delay: 0s !important; caret-color: transparent !important; } ::-webkit-scrollbar { display: none; } body { -ms-overflow-style: none; scrollbar-width: none; }"
      });

      await page.evaluate(() => {
        const modal = document.getElementById("playerModal");
        if (!modal) {
          throw new Error("Missing player modal root element");
        }

        modal.classList.remove("hidden");
        modal.removeAttribute("hidden");

        modal.setAttribute("data-ds", "new");

        const html = document.documentElement;
        if (html) {
          html.setAttribute("data-ds", "new");
        }
        if (document.body) {
          document.body.setAttribute("data-ds", "new");
        }

        window.scrollTo(0, 0);
      });

      await page.waitForTimeout(100);

      const screenshotBuffer = await page.screenshot({
        type: "png",
        fullPage: true,
        animations: "disabled"
      });

      if (UPDATE_BASELINES) {
        setBaseline(VIDEO_MODAL_BASELINE_KEY, screenshotBuffer);
        await testInfo.attach(`${VIDEO_MODAL_BASELINE_KEY}-actual.png`, {
          body: screenshotBuffer,
          contentType: "image/png"
        });
        return;
      }

      const baselineBuffer = getBaseline(VIDEO_MODAL_BASELINE_KEY);
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
        await testInfo.attach(`${VIDEO_MODAL_BASELINE_KEY}-actual.png`, {
          body: screenshotBuffer,
          contentType: "image/png"
        });
        await testInfo.attach(`${VIDEO_MODAL_BASELINE_KEY}-baseline.png`, {
          body: baselineBuffer,
          contentType: "image/png"
        });
        await testInfo.attach(`${VIDEO_MODAL_BASELINE_KEY}-diff.png`, {
          body: PNG.sync.write(diff),
          contentType: "image/png"
        });
      }

      expect(diffRatio).toBeLessThanOrEqual(MAX_DIFF_RATIO);
    });
});
