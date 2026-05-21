import fs from "fs";
import path from "path";

/** Кандидаты путей к vite outDir (dist/public), порядок важен. */
export function resolveFrontendDist(): string | null {
  const candidates: string[] = [];

  if (process.env.FRONTEND_DIST?.trim()) {
    candidates.push(path.resolve(process.env.FRONTEND_DIST.trim()));
  }

  // Собранный api-server: artifacts/api-server/dist/index.cjs
  if (typeof __dirname !== "undefined") {
    candidates.push(path.resolve(__dirname, "../../astrobot/dist/public"));
  }

  candidates.push(path.resolve(process.cwd(), "artifacts/astrobot/dist/public"));

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "index.html"))) {
      return dir;
    }
  }

  return null;
}
