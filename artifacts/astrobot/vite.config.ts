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

/**
 * Абсолютный https-origin для og:image / og:url.
 * Telegram и часть других краулеров плохо берут относительный путь в og:image.
 */
function detectPublicOrigin(): string {
  const explicit = (process.env.VITE_PUBLIC_ORIGIN || "").trim().replace(/\/+$/, "");
  if (explicit) return explicit;

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//i, "")}`;

  const cf = process.env.CF_PAGES_URL?.trim().replace(/\/+$/, "");
  if (cf && /^https?:\/\//i.test(cf)) return cf;

  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railway) return `https://${railway.replace(/^https?:\/\//i, "")}`;

  const netlify = process.env.URL?.trim().replace(/\/+$/, "");
  if (netlify && /^https:\/\//i.test(netlify)) return netlify;

  const render = process.env.RENDER_EXTERNAL_URL?.trim().replace(/\/+$/, "");
  if (render && /^https:\/\//i.test(render)) return render;

  return "";
}

function ogImagePath(): string {
  const base = basePath === "/" ? "" : basePath.replace(/\/+$/, "");
  const p = `${base}/og-image.png`.replace(/^\/\//, "/");
  return p.startsWith("/") ? p : `/${p}`;
}

/** Полный URL картинки превью или относительный путь (если origin неизвестен при сборке) */
function publicOgImageUrl(): string {
  const origin = detectPublicOrigin();
  const path = ogImagePath();
  if (origin) return `${origin}${path}`;
  return path;
}

function publicOgSiteUrl(): string {
  const origin = detectPublicOrigin();
  if (!origin) return "";
  const base = basePath === "/" ? "" : basePath.replace(/\/+$/, "");
  return `${origin}${base || ""}/`;
}

export default defineConfig({
  base: basePath,
  plugins: [
    {
      name: "html-og-meta",
      transformIndexHtml(html) {
        const image = publicOgImageUrl();
        if (process.env.NODE_ENV === "production" && !/^https?:\/\//i.test(image)) {
          console.warn(
            "[html-og-meta] og:image не абсолютный URL — задайте VITE_PUBLIC_ORIGIN=https://ваш-домен при сборке, иначе Telegram/VK могут не показать картинку.",
          );
        }
        let out = html.replaceAll("__OG_IMAGE__", image);
        const siteUrl = publicOgSiteUrl();
        if (siteUrl) {
          out = out.replace(
            "</head>",
            `    <meta property="og:url" content="${siteUrl}" />\n  </head>`,
          );
        }
        if (image.startsWith("https://")) {
          out = out.replace(
            '<meta property="og:image" ',
            `<meta property="og:image:secure_url" content="${image}" />\n    <meta property="og:image" `,
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
    /** Старые мобильные Safari без части синтаксиса esnext */
    target: ["es2020", "safari14"],
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
