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
      manifest: {
        name: "AGRI ONE",
        short_name: "AGRI ONE",
        description: "AI-powered multilingual farm decision & action platform",
        theme_color: "#166534",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        // Chrome will not offer "Install" without a 192 and a 512 icon,
        // so with an empty array the PWA could not be installed at all.
        // These are plain placeholder marks in the existing theme
        // colour, not a brand identity — replace them with real assets.
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api/],
        // The locale bundles MUST be precached. i18n starts with no
        // resources and fetches them at boot, so without this an offline
        // launch fails that fetch and the farmer gets a screen of raw
        // keys — the offline shell is only useful if it can speak.
        // They are static text; a new deployment revisions them.
        globPatterns: ["**/*.{js,css,html,ico,json}"]
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
