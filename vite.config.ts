/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      manifest: {
        name: "Playboard",
        short_name: "Playboard",
        description: "Learn piano in the browser with a MIDI keyboard or microphone.",
        theme_color: "#315e49",
        background_color: "#f6f7f3",
        display: "standalone",
        start_url: "/",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      workbox: {
        // App shell, lessons, pieces and the pitch model. Piano samples are cached in IndexedDB instead.
        globPatterns: ["**/*.{js,css,html,svg,woff2,musicxml,json,bin}"],
        globIgnores: ["samples/**"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/samples\//, /^\/models\//],
      },
    }),
  ],
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
