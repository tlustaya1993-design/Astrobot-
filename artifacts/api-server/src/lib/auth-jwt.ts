const DEV_JWT_SECRET = "astrobot-dev-secret-change-in-production";

export function getJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.JWT_SECRET?.trim();
  if (configured) return configured;
  if (env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production");
  }
  return DEV_JWT_SECRET;
}

export const JWT_SECRET = getJwtSecret();
