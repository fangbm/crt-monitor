import { defineConfig } from "vite";

// Tauri expects a fixed dev port so its WebView always finds the dev server.
export default defineConfig({
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: "chrome105",
  },
});
