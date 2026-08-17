import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Client-only React SPA: wallet injectors (Ready / Xverse) need the browser.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@stk402/shared": path.resolve(rootDir, "../src/shared"),
    },
  },
  server: {
    host: true,
    port: 5173,
    // Allow wallet in-app browsers / tunnels to hit the Vite host.
    allowedHosts: true,
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: true,
  },
  build: {
    // SPA history fallback is handled by hosts; keep a single index entry.
    sourcemap: true,
  },
});
