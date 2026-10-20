import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  server: {
    fs: { allow: [".."] }, // ../shared
    // Same origin in dev, so the session cookie works without CORS.
    proxy: { "/api": "http://localhost:8787" },
  },
  // GitHub Pages serves from /<repo>/ (set by the Pages workflow); "./" works anywhere else.
  base: process.env.VITE_BASE ?? "./",
  build: { target: "es2022" },
});
