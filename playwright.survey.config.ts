import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e-survey", timeout: 45000, workers: 1,
  use: { baseURL: "http://127.0.0.1:4187", screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: {
    command: "npx wrangler d1 migrations apply otocanvas-survey --local && npx wrangler pages dev dist --port 4187 --binding SURVEY_ADMIN_KEY=local-test-only-survey-key-123456",
    url: "http://127.0.0.1:4187", reuseExistingServer: false, timeout: 90000,
  },
});
