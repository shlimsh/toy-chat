import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: "hidden",
  },
  server: {
    host: "localhost",
    port: 5173,
    proxy: {
      "/auth": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/chat": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/conversations": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/api": {
  target: "http://127.0.0.1:3001",
  changeOrigin: true,
},
      "/health": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
});