import { expect, test } from "@playwright/test";

const FIXTURE_URL = "/docs/moderation/fixtures/index.html";
const RESTORE_BUTTON_LABEL = "Restore default moderation";

async function waitForFixtureReady(page) {
  await page.waitForSelector('body[data-ready="true"]');
}

test("repro: show anyway override button visibility", async ({ page }) => {
    // 1. Navigate to fixture
    await page.goto(FIXTURE_URL, { waitUntil: "networkidle" });
    await waitForFixtureReady(page);

    // 2. Locate the card that should have the button
    const overrideCard = page.locator('[data-test-id="show-anyway"]');

    // 3. Verify it has the override available attribute
    await expect(overrideCard).toHaveAttribute(
      "data-moderation-override-available",
      "true"
    );

    // 4. Locate the button
    const showAnywayButton = overrideCard.getByRole("button", { name: "Show anyway" });
    const restoreButtonQuery = overrideCard.getByRole("button", {
      name: RESTORE_BUTTON_LABEL,
    });

    // 5. Assert visibility (this is expected to fail)
    console.log("Checking visibility of 'Show anyway' button...");
    await expect(showAnywayButton).toBeVisible();

    console.log("'Show anyway' button is visible. Attempting click...");
    // 6. Click (this is expected to fail/timeout if not visible)
    await showAnywayButton.click({ force: true });

    // 7. Verify state change
    await expect(overrideCard).toHaveAttribute(
      "data-moderation-override",
      "show-anyway"
    );
});
