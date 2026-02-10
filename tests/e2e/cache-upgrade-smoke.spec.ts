import { expect, test } from "@playwright/test";

test("reload after deploy upgrade picks latest hashed bundle without manual cache clear", async ({
  page,
}) => {
  let activeVersion = "v1";

  await page.route("**/cache-upgrade-smoke/index.html", async (route) => {
    const html = `<!doctype html>
<html>
  <head>
    <meta charset=\"utf-8\" />
    <title>Cache Upgrade Smoke</title>
    <script src=\"/cache-upgrade-smoke/app.${activeVersion}.js\"></script>
  </head>
  <body>
    <div id=\"app\">cache-upgrade-smoke</div>
  </body>
</html>`;

    await route.fulfill({
      status: 200,
      contentType: "text/html",
      headers: {
        "cache-control": "no-cache",
      },
      body: html,
    });
  });

  await page.route("**/cache-upgrade-smoke/app.*.js", async (route) => {
    const requestUrl = new URL(route.request().url());
    const filename = requestUrl.pathname.split("/").pop() ?? "";

    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      headers: {
        "cache-control": "public, max-age=31536000, immutable",
      },
      body: `window.__cacheUpgradeBundle = ${JSON.stringify(filename)};`,
    });
  });

  await page.goto("/cache-upgrade-smoke/index.html");
  await expect
    .poll(() => page.evaluate(() => (window as any).__cacheUpgradeBundle))
    .toBe("app.v1.js");

  activeVersion = "v2";

  await page.reload();
  await expect
    .poll(() => page.evaluate(() => (window as any).__cacheUpgradeBundle))
    .toBe("app.v2.js");
});
