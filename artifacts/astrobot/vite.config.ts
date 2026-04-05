import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;
const isBuild = process.argv.includes("build");

if (!rawPort && !isBuild) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort || "3000");

if (!isBuild && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || "/";

/** Публичный origin без слэша, напр. https://astrobot.example.com — для абсолютных og:image / og:url в превью мессенджеров */
function publicOgImageUrl(): string {
  const origin = (process.env.VITE_PUBLIC_ORIGIN || "").trim().replace(/\/+$/, "");
  const base =
    basePath === "/" ? "" : basePath.replace(/\/+$/, "");
  const path = `${base}/og-image.png`.replace(/^\/\//, "/");
  if (origin) return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
  return path.startsWith("/") ? path : `/${path}`;
}

function publicOgSiteUrl(): string {
  const origin = (process.env.VITE_PUBLIC_ORIGIN || "").trim().replace(/\/+$/, "");
  if (!origin) return "";
  const base =
    basePath === "/" ? "" : basePath.replace(/\/+$/, "");
  return `${origin}${base || ""}/`;
}

export default defineConfig({
  base: basePath,
  plugins: [
    {
      name: "html-og-meta",
      transformIndexHtml(html) {
        const image = publicOgImageUrl();
        let out = html.replaceAll("__OG_IMAGE__", image);
        const siteUrl = publicOgSiteUrl();
        if (siteUrl) {
          out = out.replace(
            "</head>",
            `    <meta property="og:url" content="${siteUrl}" />\n  </head>`,
          );
        }
        return out;
      },
    },
    react(),
    tailwindcss(),
    ...(process.env.REPL_ID !== undefined
      ? [runtimeErrorOverlay()]
      : []),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    hmr: process.env.REPLIT_DEV_DOMAIN ? {
      protocol: "wss",
      host: process.env.REPLIT_DEV_DOMAIN,
      port: 443,
    } : true,
    headers: process.env.NODE_ENV !== "production" ? {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
    } : {},
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.API_PORT || "8080"}`,
        changeOrigin: false,
        secure: false,
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
