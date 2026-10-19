import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  server: {
    fs: { allow: [".."] }, // ../shared
    // Same origin in dev, so the session cookie works without CORS.
    proxy: { "/api": "http://localhost:8787" },
  },
  base: "./", // works at a domain root or a GitHub Pages sub-path
  build: { target: "es2022" },
});
