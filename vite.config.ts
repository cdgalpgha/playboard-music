/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  worker: { format: "es" },
  // Pre-bundle lazily imported libraries so the dev server never reloads mid-session.
  optimizeDeps: { include: ["opensheetmusicdisplay"] },
  build: {
    target: "es2022",
    sourcemap: true,
  },
  test: {
    environment: "node",
    // `npm run perf:sampler` sets PERF=1 to run the timing tests on their own.
    include: process.env.PERF ? ["src/**/*.perf.ts"] : ["src/**/*.test.ts"],
  },
});
