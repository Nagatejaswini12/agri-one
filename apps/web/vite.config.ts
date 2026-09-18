import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// PWA caches the app shell only — never live farm/weather/market data,
// which must always be re-fetched and can show an "unavailable" state.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico"],
      manifest: {
        name: "AGRI ONE",
        short_name: "AGRI ONE",
        description: "AI-powered multilingual farm decision & action platform",
        theme_color: "#166534",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: []
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api/]
      }
    })
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  server: {
    port: 5173
  }
});
