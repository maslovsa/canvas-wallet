import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
    // Unit tests must not depend on a developer's local .env.local (which points the dev server at the live Worker).
    env: { VITE_RISK_PROXY_URL: "" },
  },
});
