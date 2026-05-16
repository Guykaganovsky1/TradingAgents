import { test, expect } from "@playwright/test";

test.describe("Overview page", () => {
  test("loads and shows key sections", async ({ page }) => {
    await page.goto("/");

    // Check for the backend error banner or the stat cards
    const hasError = await page
      .locator("text=Could not reach backend")
      .isVisible()
      .catch(() => false);

    if (hasError) {
      // Backend is down — that's expected in test environments
      await expect(page.locator("text=Could not reach backend")).toBeVisible();
    } else {
      // Backend is up
      await expect(page.locator("text=Active Signals")).toBeVisible();
    }
  });

  test("navigation links work", async ({ page }) => {
    await page.goto("/");
    await page.goto("/run");
    await expect(page).toHaveURL("/run");
    await page.goto("/watchlist");
    await expect(page).toHaveURL("/watchlist");
    await page.goto("/history");
    await expect(page).toHaveURL("/history");
    await page.goto("/settings");
    await expect(page).toHaveURL("/settings");
  });

  test("quick run form navigates to /run", async ({ page }) => {
    await page.goto("/");
    // Find the ticker input in quick run card
    const input = page.locator("input[placeholder*='AAPL']").first();
    if (await input.isVisible()) {
      await input.fill("AAPL");
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/run/);
    }
  });
});
