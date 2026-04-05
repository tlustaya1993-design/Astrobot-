import type { Request } from "express";

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

/** Origin из env (тот же приоритет, что в vite при сборке). */
function originFromEnv(): string {
  const explicit = (
    process.env.VITE_PUBLIC_ORIGIN ||
    process.env.PUBLIC_ORIGIN ||
    ""
  )
    .trim()
    .replace(/\/+$/, "");
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

/**
 * Публичный origin для og:image: сначала env, иначе Host / X-Forwarded-* из запроса
 * (Railway часто не передаёт домен в этап сборки фронта — тогда подставляем при отдаче HTML).
 */
export function resolvePublicOrigin(req: Request): string {
  const fromEnv = originFromEnv();
  if (fromEnv) return fromEnv;

  const host =
    req.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    req.get("host")?.trim() ||
    "";
  if (!host) return "";

  let proto =
    req.get("x-forwarded-proto")?.split(",")[0]?.trim() || req.protocol || "http";
  proto = proto.replace(/:$/, "");

  return `${proto}://${host}`;
}

function basePathPrefix(): string {
  const base = (process.env.BASE_PATH || "/").replace(/\/+$/, "");
  return base === "/" ? "" : base;
}

function ogImagePath(): string {
  const prefix = basePathPrefix();
  const p = `${prefix}/og-image.png`.replace(/\/{2,}/g, "/");
  return p.startsWith("/") ? p : `/${p}`;
}

function ogSiteUrl(origin: string): string {
  const prefix = basePathPrefix();
  if (!prefix) return `${origin}/`;
  return `${origin}${prefix}/`;
}

/**
 * Абсолютные og:image / twitter:image / og:url для мессенджеров.
 * Плейсхолдер __OG_IMAGE__ подменяется, если остался после сборки.
 */
export function injectOpenGraphMeta(html: string, origin: string): string {
  if (!origin) return html;

  const imageUrl = `${stripTrailingSlash(origin)}${ogImagePath()}`;
  const siteUrl = ogSiteUrl(stripTrailingSlash(origin));

  let out = html.replaceAll("__OG_IMAGE__", imageUrl);

  if (imageUrl.startsWith("https://") && !/property="og:image:secure_url"/i.test(out)) {
    out = out.replace(
      /<meta\s+property="og:image"\s+content="[^"]*"\s*\/>/i,
      `<meta property="og:image:secure_url" content="${imageUrl}" />\n    <meta property="og:image" content="${imageUrl}" />`,
    );
  } else {
    out = out.replace(
      /(<meta\s+property="og:image"\s+content=")[^"]*(")/i,
      `$1${imageUrl}$2`,
    );
    out = out.replace(
      /(<meta\s+property="og:image:secure_url"\s+content=")[^"]*(")/i,
      `$1${imageUrl}$2`,
    );
  }
  out = out.replace(
    /(<meta\s+name="twitter:image"\s+content=")[^"]*(")/i,
    `$1${imageUrl}$2`,
  );
  out = out.replace(
    /(<meta\s+property="og:url"\s+content=")[^"]*(")/i,
    `$1${siteUrl}$2`,
  );

  return out;
}
