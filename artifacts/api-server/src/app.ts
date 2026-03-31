import path from "path";
import fs from "fs";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

// Path resolution:
// - CJS production bundle: __dirname = /app/artifacts/api-server/dist → root 3 levels up
// - ESM dev (tsx): __dirname is not defined → use process.cwd() (workspace root)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - __dirname exists in CJS bundles but not ESM
const _root: string = typeof __dirname !== "undefined"
  ? path.resolve(__dirname, "../../..")
  : process.cwd();

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
const frontendDist = path.resolve(_root, "artifacts/astrobot/dist/public");
if (process.env.NODE_ENV === "production" && fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // SPA fallback
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

export default app;
