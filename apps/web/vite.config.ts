import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "node:path";
export default defineConfig({
  root: resolve("apps/web"),
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: {
        name: "Baxter Response",
        short_name: "Response",
        description: "EMEA shipment response and guided action",
        theme_color: "#123c47",
        background_color: "#f7f8fa",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      devOptions: { enabled: true, type: "module" },
    }),
  ],
  server: {
    host: "0.0.0.0",
    port: 5180,
    strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:3001", changeOrigin: false } },
  },
  build: {
    outDir: resolve("dist/web"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
});
