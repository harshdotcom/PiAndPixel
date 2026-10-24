import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:7860", changeOrigin: true, ws: true },
    },
  },
  // Monaco (~2.8 MB) is its own lazily loaded chunk, so the default 500 kB warning is noise.
  build: { outDir: "dist", chunkSizeWarningLimit: 3000 },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
