import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    {
      /* Legacy root-level *.js copies (admin.js, index.js, ...) are not part of
         the app, but Vite resolves /admin to admin.js and fails. Send
         extension-less app routes to the SPA shell instead. */
      name: "spa-shell-for-extensionless-routes",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          const url = (req.url || "").split("?")[0];
          if (/^\/[a-z0-9-]+$/i.test(url) && url !== "/" && !url.includes(".")) {
            req.url = "/index.html";
          }
          next();
        });
      },
    },
  ],
  build: {
    rollupOptions: {
      input: "src/index.html",
    },
  },
  server: {
    host: "0.0.0.0",
    port: 3001,
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET || "http://localhost:3002",
        changeOrigin: true,
      },
    },
  },
});
