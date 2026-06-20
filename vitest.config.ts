import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure-function tests only — no DOM, no network.
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
