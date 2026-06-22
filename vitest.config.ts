import { defineConfig } from "vitest/config";
import path from "path";

// Dedicated config for server-side tests. Kept separate from vite.config.ts so
// the React/Replit plugins don't load in the Node test environment. Path aliases
// mirror vite.config.ts so shared modules resolve the same way.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts"],
    globals: true,
  },
});
