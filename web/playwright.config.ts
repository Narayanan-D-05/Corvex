import { defineConfig, devices } from "@playwright/test";

// The console test needs a fresh local chain with the contracts deployed (see web/README.md).
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3110", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx next start -p 3110",
    url: "http://localhost:3110",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
