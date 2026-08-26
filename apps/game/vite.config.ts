import { defineConfig } from "vite";

export default defineConfig({
  root: "apps/game",
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:5174",
      "/characters": "http://127.0.0.1:5174",
      "/ws": {
        target: "ws://127.0.0.1:5174",
        ws: true
      }
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
