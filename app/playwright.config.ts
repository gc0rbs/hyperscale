import { defineConfig, devices } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";

/** Use the pre-installed Chromium when Playwright's own download is unavailable (remote sessions). */
function preinstalledChromium(): string | undefined {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  if (!existsSync(root)) return undefined;
  for (const d of readdirSync(root)) {
    const p = `${root}/${d}/chrome-linux/chrome`;
    if (d.startsWith("chromium-") && existsSync(p)) return p;
  }
  return undefined;
}

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 120_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure", screenshot: "only-on-failure", ...devices["Desktop Chrome"], launchOptions: { executablePath: preinstalledChromium(), args: ["--no-sandbox"] } },
  webServer: { command: "pnpm dev --port 3000", url: "http://127.0.0.1:3000", reuseExistingServer: false, timeout: 120_000, env: { NEXT_PUBLIC_DEV_ACCOUNTS: "1" } },
});
