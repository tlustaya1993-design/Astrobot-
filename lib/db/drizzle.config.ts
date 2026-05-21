import { defineConfig } from "drizzle-kit";
import path from "path";

/** Локально: public URL Postgres. На Railway в сервисе API — ${{Postgres.DATABASE_URL}} (private). */
const databaseUrl =
  process.env.DATABASE_URL ?? process.env.DATABASE_PRIVATE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL (or DATABASE_PRIVATE_URL) must be set");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
