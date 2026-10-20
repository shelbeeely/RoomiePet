import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// In development the API runs on :3000 (npm run dev starts both); in
// production the server serves the built app itself, so no proxy is needed.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@shared": fileURLToPath(new URL("../shared", import.meta.url)) } },
  server: {
    host: true,
    proxy: { "/api": { target: "http://localhost:3000", changeOrigin: false } },
    fs: { allow: [".."] },
  },
  test: { environment: "node", include: ["../shared/**/*.test.js", "src/**/*.test.{js,jsx}"] },
});
