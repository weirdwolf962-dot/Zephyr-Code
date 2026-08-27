import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Zephyr Code — standalone project, own dev server.
// The COOP/COEP headers below matter for LOCAL dev only (npm run dev).
// In production (Vercel), the same headers are set via vercel.json instead,
// since Vite's dev-server config has no effect on the deployed build.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 3000,
  }
});
