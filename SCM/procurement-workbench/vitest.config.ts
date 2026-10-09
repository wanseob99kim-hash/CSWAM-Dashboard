import { defineConfig } from "vitest/config";

// Kept separate from vite.config.ts so unit tests do not boot the Cloudflare/vinext plugins.
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
