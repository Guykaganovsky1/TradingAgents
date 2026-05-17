import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config.
 *
 * IMPORTANT — local runs do NOT spawn a dev server.
 * Start it yourself first:
 *   bash dashboard/scripts/start-frontend.sh --bg
 *
 * Why: `pnpm dev` invoked from Playwright's `webServer.command` previously
 * stacked on top of human-started instances and contributed to a 3990-process
 * fork bomb (Next 16 + Tailwind 4 + PostCSS worker pool). We now require an
 * already-running server (`reuseExistingServer: true`) and fail fast if it's
 * not up — that way the developer notices instead of silently spawning more.
 *
 * In CI we still spin one up, but via the same single-instance guard script.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",

  use: {
    baseURL: "http://localhost:3232",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: process.env.CI
    ? {
        // CI: use the guarded launcher so the process group can be reaped.
        command: "bash ../scripts/start-frontend.sh",
        url: "http://localhost:3232",
        reuseExistingServer: false,
        timeout: 180_000,
      }
    : {
        // Local: REQUIRE an already-running server. Never spawn.
        // Using a no-op command that exits 0 paired with reuseExistingServer
        // true means Playwright will check the URL and fail with a clear
        // message if nothing is listening — but it will NEVER spawn one.
        command: "echo 'Refusing to auto-spawn dev server — start it manually: bash dashboard/scripts/start-frontend.sh --bg' && exit 1",
        url: "http://localhost:3232",
        reuseExistingServer: true,
        timeout: 10_000,
      },
});
