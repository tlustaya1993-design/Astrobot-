import type { Request } from "express";

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

/** Telegram и др. требуют https у og:image; в env иногда оставляют http. */
function normalizeOriginHttps(origin: string): string {
  const o = origin.trim().replace(/\/+$/, "");
  if (!o) return "";
  if (!/^https?:\/\//i.test(o)) return o;
  try {
    const u = new URL(o);
    const host = u.hostname;
    if (host !== "localhost" && !host.startsWith("127.")) {
      u.protocol = "https:";
    }
    return u.toString().replace(/\/+$/, "");
  } catch {
    return o.replace(/^http:\/\//i, "https://");
  }
}

function isLikelyPublicRequestHost(host: string): boolean {
  if (!host) return false;
  const h = host.split(":")[0].toLowerCase();
  if (h === "localhost" || h.startsWith("127.")) return false;
  if (h.endsWith(".internal") || h.includes("railway.internal")) return false;
  return true;
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
  if (explicit) return normalizeOriginHttps(explicit);

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//i, "")}`;

  const cf = process.env.CF_PAGES_URL?.trim().replace(/\/+$/, "");
  if (cf && /^https?:\/\//i.test(cf)) return cf;

  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railway) return `https://${railway.replace(/^https?:\/\//i, "")}`;

  const netlify = process.env.URL?.trim().replace(/\/+$/, "");
  if (netlify && /^https:\/\//i.test(netlify)) return normalizeOriginHttps(netlify);

  const render = process.env.RENDER_EXTERNAL_URL?.trim().replace(/\/+$/, "");
  if (render && /^https:\/\//i.test(render)) return normalizeOriginHttps(render);

  return "";
}

/**
 * Публичный origin для og:image.
 * Сначала Host запроса (чтобы превью совпадало с тем доменом, по которому открыли ссылку),
 * иначе env — как при сборке Vite.
 */
export function resolvePublicOrigin(req: Request): string {
  const hostRaw =
    req.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    req.get("host")?.trim() ||
    "";
  const cleanHost = hostRaw.split(":")[0]?.trim() ?? "";

  if (cleanHost && isLikelyPublicRequestHost(cleanHost)) {
    let proto =
      req.get("x-forwarded-proto")?.split(",")[0]?.trim() || req.protocol || "http";
    proto = proto.replace(/:$/, "");
    if (!cleanHost.includes("localhost") && !cleanHost.startsWith("127.")) {
      proto = "https";
    }
    return `${proto}://${cleanHost}`;
  }

  const fromEnv = originFromEnv();
  if (fromEnv) return fromEnv;

  if (!cleanHost) return "";

  let proto =
    req.get("x-forwarded-proto")?.split(",")[0]?.trim() || req.protocol || "http";
  proto = proto.replace(/:$/, "");
  return normalizeOriginHttps(`${proto}://${hostRaw}`);
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
/** Версия в query — сброс кэша Telegram после смены картинки */
const OG_IMAGE_CACHE_KEY =
  process.env.OG_IMAGE_CACHE_KEY?.trim() || "20260404b";

export function injectOpenGraphMeta(html: string, origin: string): string {
  if (!origin) return html;

  const baseImageUrl = `${stripTrailingSlash(origin)}${ogImagePath()}`;
  const sep = baseImageUrl.includes("?") ? "&" : "?";
  const imageUrl = `${baseImageUrl}${sep}v=${OG_IMAGE_CACHE_KEY}`;
  const siteUrl = ogSiteUrl(stripTrailingSlash(origin));

  let out = html.replaceAll("__OG_IMAGE__", imageUrl);

  // Сборка Vite могла вставить secure_url — убираем, чтобы не было дублей с нашим блоком
  out = out.replace(/<meta\s+property="og:image:secure_url"\s+content="[^"]*"\s*\/>/gi, "");
  out = out.replace(/<meta\s+property="og:image:url"\s+content="[^"]*"\s*\/>/gi, "");

  const ogImageBlock = imageUrl.startsWith("https://")
    ? `<meta property="og:image:secure_url" content="${imageUrl}" />\n    <meta property="og:image:url" content="${imageUrl}" />\n    <meta property="og:image" content="${imageUrl}" />`
    : `<meta property="og:image" content="${imageUrl}" />`;

  out = out.replace(/<meta\s+property="og:image"\s+content="[^"]*"\s*\/>/i, ogImageBlock);
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
