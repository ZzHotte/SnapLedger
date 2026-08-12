import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // needed so @testing-library/react's auto-cleanup afterEach registers itself
    // (it detects globalThis.afterEach) — without this, unmounted components from
    // earlier tests in the same file linger in the DOM and pollute later queries
    globals: true,
  },
});
