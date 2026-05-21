import path from "path";
import fs from "fs";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { isDatabaseConfigured } from "@workspace/db";
import { getDbInitStatus } from "./lib/db-init.js";
import { resolveFrontendDist } from "./lib/frontend-dist.js";
import { logger } from "./lib/logger";
import { sessionMiddleware } from "./middleware/auth.js";
import { injectOpenGraphMeta, injectAdminMeta, resolvePublicOrigin } from "./lib/spaHtml";

/** Регистрирует API + static SPA на переданном Express (тот же инстанс, что слушает порт). */
export function configureApp(app: Express): void {
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

  app.use("/api", (req, res, next) => {
    if (req.path === "/healthz" || req.path === "/readyz") {
      next();
      return;
    }
    if (!isDatabaseConfigured()) {
      res.status(503).json({
        error: "База данных не настроена (DATABASE_URL).",
        code: "DB_NOT_CONFIGURED",
      });
      return;
    }
    const dbStatus = getDbInitStatus();
    if (dbStatus !== "ready") {
      res.setHeader("Retry-After", "3");
      res.status(503).json({
        error:
          dbStatus === "pending"
            ? "База данных прогревается. Повторите запрос через несколько секунд."
            : "База данных временно недоступна.",
        code: dbStatus === "pending" ? "DB_WARMING_UP" : "DB_INIT_FAILED",
      });
      return;
    }
    next();
  });

  app.use("/api", router);

  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const frontendDist = resolveFrontendDist();
  if (!frontendDist) {
    logger.error(
      {
        cwd: process.cwd(),
        FRONTEND_DIST: process.env.FRONTEND_DIST ?? null,
        dirname: typeof __dirname !== "undefined" ? __dirname : null,
      },
      "Frontend dist not found (artifacts/astrobot/dist/public) — GET / will 404",
    );
    return;
  }

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

  logger.info({ frontendDist, indexPath }, "Serving SPA static files");

  app.use(express.static(frontendDist, { index: false }));

  function sendAdminIndex(req: express.Request, res: express.Response) {
    const origin = resolvePublicOrigin(req);
    let html = injectOpenGraphMeta(readIndexHtml(), origin);
    html = injectAdminMeta(html);
    res.type("html").send(html);
  }

  app.get("/", sendSpaIndex);
  app.get("/index.html", sendSpaIndex);
  app.get("/admin", sendAdminIndex);
  app.get("/admin/{*path}", sendAdminIndex);
  app.get("/{*path}", sendSpaIndex);
}
