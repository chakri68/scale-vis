/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  test: {
    // Pure scale/ functions only — the DOM view layer is exercised by hand.
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
