import { test, expect } from "@playwright/test";

const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "laptop-1024", width: 1024, height: 768 },
  { name: "desktop-1440", width: 1440, height: 900 },
];

const PAGES = [
  { path: "/", name: "overview" },
  { path: "/run", name: "run" },
  { path: "/watchlist", name: "watchlist" },
  { path: "/history", name: "history" },
  { path: "/settings", name: "settings" },
];

for (const viewport of VIEWPORTS) {
  test.describe(`Responsive @ ${viewport.width}px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const page of PAGES) {
      test(`${page.name} renders without errors`, async ({ page: pw }) => {
        const errors: string[] = [];
        pw.on("pageerror", (err) => errors.push(err.message));

        await pw.goto(page.path, { waitUntil: "domcontentloaded" });

        // Page should not be a blank white or error screen
        await expect(pw.locator("body")).not.toBeEmpty();

        // Take screenshot for visual reference
        await pw.screenshot({
          path: `tests/e2e/screenshots/${viewport.name}-${page.name}.png`,
          fullPage: false,
        });

        // No critical JS errors
        const criticalErrors = errors.filter(
          (e) =>
            !e.includes("NEXT_NOT_FOUND") &&
            !e.includes("fetch") // backend may not be running
        );
        expect(criticalErrors).toHaveLength(0);
      });
    }

    test("sidebar visible only on lg+", async ({ page: pw }) => {
      await pw.goto("/", { waitUntil: "domcontentloaded" });
      const sidebar = pw.locator("aside[aria-label='Main navigation']");
      if (viewport.width >= 1024) {
        await expect(sidebar).toBeVisible();
      } else {
        await expect(sidebar).not.toBeVisible();
      }
    });

    test("bottom nav visible only on < lg", async ({ page: pw }) => {
      await pw.goto("/", { waitUntil: "domcontentloaded" });
      const bottomNav = pw.locator("nav[aria-label='Mobile navigation']");
      if (viewport.width < 1024) {
        await expect(bottomNav).toBeVisible();
      } else {
        await expect(bottomNav).not.toBeVisible();
      }
    });
  });
}
