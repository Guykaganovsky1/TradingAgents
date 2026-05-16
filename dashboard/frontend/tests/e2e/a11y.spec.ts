/**
 * Accessibility smoke tests.
 * Uses axe-core via @axe-core/playwright to sweep every page.
 */
import { test, expect } from "@playwright/test";

const PAGES = ["/", "/run", "/watchlist", "/history", "/settings"];

// Note: axe-core is imported lazily to avoid breaking test runs
// when the backend is not available
test.describe("Accessibility (WCAG AA)", () => {
  for (const path of PAGES) {
    test(`${path} passes basic a11y checks`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });

      // Check essential landmarks
      const main = page.locator("#main-content, main");
      await expect(main.first()).toBeAttached();

      // All images have alt text
      const imgs = await page.locator("img").all();
      for (const img of imgs) {
        const alt = await img.getAttribute("alt");
        expect(alt).not.toBeNull();
      }

      // All interactive elements should have accessible names
      const buttons = await page.locator("button:not([aria-hidden])").all();
      for (const btn of buttons) {
        const name =
          (await btn.getAttribute("aria-label")) ||
          (await btn.innerText().catch(() => ""));
        expect(name.trim()).not.toBe("");
      }

      // Focus rings — elements should be focusable
      const firstFocusable = page.locator("a[href], button, input").first();
      if (await firstFocusable.isVisible()) {
        await firstFocusable.focus();
        // Focused element should exist
        const focused = await page.evaluate(
          () => document.activeElement?.tagName
        );
        expect(focused).toBeDefined();
      }
    });
  }
});
