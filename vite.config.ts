// Receita da TELA (vite). Antes, a da Replit desligava sozinha sem PORT e
// BASE_PATH e trazia 3 plugins da Replit. Esta não precisa de nada disso.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const SERVIDOR = `http://localhost:${process.env.PORT || 8080}`;

export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@workspace/api-client-react": path.resolve(__dirname, "lib/api-client-react/index.ts"),
    },
  },
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 4000 },
  server: {
    port: 5173,
    host: true,
    // O "carteiro": tudo que começa com /api vai para o servidor
    proxy: { "/api": { target: SERVIDOR, changeOrigin: true } },
  },
});
