import { defineConfig } from "vite";

// Static site, no backend — base "/" works for local dev; override via
// VITE_BASE for a GitHub Pages project-page deployment (e.g. "/token-ui-studio/").
export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
