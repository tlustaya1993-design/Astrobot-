import { execSync } from "child_process";

async function waitForDb(url: string, maxRetries = 10, delayMs = 3000): Promise<void> {
  const { Pool } = (await import("pg")).default;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const pool = new Pool({ connectionString: url });
      await pool.query("SELECT 1");
      await pool.end();
      console.log("Database is ready!");
      return;
    } catch {
      console.log(`Waiting for database... (${i + 1}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error("Database not ready after max retries");
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL not set, skipping migrations");
  process.exit(0);
}

await waitForDb(dbUrl);

try {
  execSync("pnpm --filter @workspace/db run push:ci", { stdio: "inherit" });
  console.log("Migrations complete!");
} catch (err) {
  console.error("Migration failed:", err);
  process.exit(1);
}
