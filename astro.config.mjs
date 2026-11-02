// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
    // Ensure proper asset handling for Tauri
    build: {
      target: "esnext",
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/three")) {
              return "three-vendor";
            }
            if (id.includes("node_modules/gsap")) {
              return "gsap-vendor";
            }
          },
        },
      },
    },
    // Clear screen disabled for Tauri dev
    clearScreen: false,
    server: {
      strictPort: true,
    },
  },
});
