import path from "path";
import fs from "fs";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { sessionMiddleware } from "./middleware/auth.js";
import { injectOpenGraphMeta, injectAdminMeta, resolvePublicOrigin } from "./lib/spaHtml";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);

app.use("/api", router);

// Serve built frontend in production
// FRONTEND_DIST env var overrides the default path (needed in Railway where
// pnpm changes CWD to the package dir, not the repo root)
const frontendDist = process.env.FRONTEND_DIST ||
  path.resolve(process.cwd(), "artifacts/astrobot/dist/public");
if (process.env.NODE_ENV === "production" && fs.existsSync(frontendDist)) {
  const indexPath = path.join(frontendDist, "index.html");
  let cachedIndexHtml: string | null = null;
  function readIndexHtml(): string {
    if (!cachedIndexHtml) {
      cachedIndexHtml = fs.readFileSync(indexPath, "utf8");
    }
    return cachedIndexHtml;
  }
  function sendSpaIndex(req: express.Request, res: express.Response) {
    const origin = resolvePublicOrigin(req);
    const html = injectOpenGraphMeta(readIndexHtml(), origin);
    res.type("html").send(html);
  }

  // index: false — иначе отдаётся сырой index.html без подстановки абсолютного og:image
  app.use(express.static(frontendDist, { index: false }));
  function sendAdminIndex(req: express.Request, res: express.Response) {
    const origin = resolvePublicOrigin(req);
    let html = injectOpenGraphMeta(readIndexHtml(), origin);
    html = injectAdminMeta(html);
    res.type("html").send(html);
  }

  app.get("/", sendSpaIndex);
  app.get("/index.html", sendSpaIndex);
  // Admin routes get a separate manifest/icon for PWA home screen shortcut
  app.get("/admin", sendAdminIndex);
  app.get("/admin/{*path}", sendAdminIndex);
  // SPA fallback — Express 5 requires named wildcard (path-to-regexp v8)
  app.get("/{*path}", sendSpaIndex);
}

export default app;
