import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  testIgnore: "staging.spec.ts",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:5199",
    browserName: "chromium",
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 5199 --strictPort",
    url: "http://127.0.0.1:5199",
    timeout: 30000,
    reuseExistingServer: false,
    stdout: "pipe",
    env: {
      NO_PROXY: "127.0.0.1,localhost",
    },
  },
  reporter: "list",
});
