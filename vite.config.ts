import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: {
    host: true,
    proxy: {
      "/api/boqris": {
        target: `http://localhost:${process.env.BOQRIS_DEV_PORT || 8788}`,
        changeOrigin: true,
      },
      "/api/pay": {
        target: `http://localhost:${process.env.BOQRIS_DEV_PORT || 8788}`,
        changeOrigin: true,
      },
      "/api": {
        target: "https://mamanay.vercel.app",
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      devOptions: { enabled: false },
      includeAssets: ["logo.png"],
      manifest: {
        name: "Jastip_mamanay",
        short_name: "Jastip_mamanay",
        description: "Point of Sale Application",
        theme_color: "#1e293b",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          {
            src: "/logo.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/logo.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
});
