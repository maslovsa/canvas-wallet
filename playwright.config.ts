import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "npm run dev",
    port: 5173,
    reuseExistingServer: !process.env.CI,
    // The Send flows mock this origin with page.route(); nothing ever calls a real Worker from the e2e suite.
    env: { VITE_RISK_PROXY_URL: "https://risk-worker.test" },
  },
  use: {
    baseURL: "http://localhost:5173",
  },
});
