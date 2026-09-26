import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e-survey", timeout: 45000, workers: 1,
  use: { baseURL: "http://127.0.0.1:4187", screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: {
    command: "npx wrangler d1 migrations apply otocanvas-survey --local && npx wrangler pages dev dist --port 4187 --binding SURVEY_ADMIN_KEY_HASH=8df43525bcca6f5882fabf9631756233ce97b76672e33cc2ec1c48428b94c4aa",
    url: "http://127.0.0.1:4187", reuseExistingServer: false, timeout: 90000,
  },
});
