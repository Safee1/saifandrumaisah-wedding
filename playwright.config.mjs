// @ts-check
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  timeout: 30000,
  webServer: {
    command: "npx http-server -p 8765 -s .",
    url: "http://127.0.0.1:8765",
    reuseExistingServer: true,
    timeout: 30000
  },
  use: {
    baseURL: "http://127.0.0.1:8765",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "iphone-se",
      use: { ...devices["iPhone SE"], browserName: "webkit" }
    },
    {
      name: "iphone-13",
      use: { ...devices["iPhone 13"], browserName: "webkit" }
    },
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], browserName: "chromium", viewport: { width: 1440, height: 900 } }
    }
  ]
});
