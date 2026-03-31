import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

// CJS-compatible __dirname (import.meta.url is undefined in CJS bundles)
const _dirname: string = (() => {
  try {
    if (import.meta.url) return path.dirname(fileURLToPath(import.meta.url));
  } catch {}
  // eslint-disable-next-line no-undef
  return typeof __dirname !== "undefined" ? __dirname : process.cwd();
})();

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

app.use("/api", router);

// Serve built frontend in production
const frontendDist = path.resolve(_dirname, "../../astrobot/dist/public");
if (process.env.NODE_ENV === "production" && fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // SPA fallback
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

export default app;
