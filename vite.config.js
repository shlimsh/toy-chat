export default defineConfig({
  plugins: [react()],

  server: {
    proxy: {
      "/auth": "http://localhost:3001",
      "/chat": "http://localhost:3001",
      "/conversations": "http://localhost:3001",
      "/monitoring": "http://localhost:3001",
      "/health": "http://localhost:3001",
    },
  },
});