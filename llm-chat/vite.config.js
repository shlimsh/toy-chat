import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const proxyTarget = "http://127.0.0.1:3001";

const proxyOptions = {
  target: proxyTarget,
  changeOrigin: true,
  configure(proxy) {
    proxy.on("proxyRes", (proxyResponse, request) => {
      const origin = request.headers.origin;
      if (origin) proxyResponse.headers["timing-allow-origin"] = origin;
      proxyResponse.headers["access-control-expose-headers"] =
        "x-request-id, server-timing";
    });
  },
};

export default defineConfig({
  plugins: [react()],
  build: {
    assetsDir: "assets",
    emptyOutDir: true,
    sourcemap: "hidden",
  },
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
    proxy: {
      "/auth": proxyOptions,
      "/chat": proxyOptions,
      "/conversations": proxyOptions,
      "/api": proxyOptions,
      "/health": proxyOptions,
    },
  },
  preview: {
    host: "localhost",
    port: 5173,
    strictPort: true,
  },
});
