import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-offline", workers: 1, timeout: 60_000,
  use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4174", serviceWorkers: "allow",
    storageState: { cookies: [], origins: [{ origin: "http://127.0.0.1:4174", localStorage: [{ name: "otocanvas.camera.v1", value: "off" }] }] },
    screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: { command: "node scripts/offline-test-server.mjs", url: "http://127.0.0.1:4174", reuseExistingServer: false },
});
