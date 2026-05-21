/** Безопасная диагностика Postgres URL/ошибок (без пароля). */

export type DatabaseUrlSource =
  | "DATABASE_URL"
  | "DATABASE_PRIVATE_URL"
  | "POSTGRES_URL"
  | "POSTGRESQL_URL"
  | "PGURL"
  | "none";

export type DbConnectErrorKind =
  | "timeout"
  | "dns"
  | "refused"
  | "auth"
  | "ssl"
  | "config"
  | "unknown";

export interface SafeDatabaseTarget {
  source: DatabaseUrlSource;
  host: string | null;
  port: string | null;
  database: string | null;
  user: string | null;
  sslmode: string | null;
  hasPassword: boolean;
  parseError: string | null;
}

export interface EnvDatabaseFlags {
  DATABASE_URL: boolean;
  DATABASE_PRIVATE_URL: boolean;
  DATABASE_PUBLIC_URL: boolean;
  POSTGRES_URL: boolean;
  POSTGRESQL_URL: boolean;
  PGURL: boolean;
  PGHOST: boolean;
  PGPORT: boolean;
  PGDATABASE: boolean;
  PGUSER: boolean;
  PGPASSWORD: boolean;
}

export function envDatabaseFlags(): EnvDatabaseFlags {
  return {
    DATABASE_URL: Boolean(process.env.DATABASE_URL?.trim()),
    DATABASE_PRIVATE_URL: Boolean(process.env.DATABASE_PRIVATE_URL?.trim()),
    DATABASE_PUBLIC_URL: Boolean(process.env.DATABASE_PUBLIC_URL?.trim()),
    POSTGRES_URL: Boolean(process.env.POSTGRES_URL?.trim()),
    POSTGRESQL_URL: Boolean(process.env.POSTGRESQL_URL?.trim()),
    PGURL: Boolean(process.env.PGURL?.trim()),
    PGHOST: Boolean(process.env.PGHOST?.trim()),
    PGPORT: Boolean(process.env.PGPORT?.trim()),
    PGDATABASE: Boolean(process.env.PGDATABASE?.trim()),
    PGUSER: Boolean(process.env.PGUSER?.trim()),
    PGPASSWORD: Boolean(process.env.PGPASSWORD?.trim()),
  };
}

export function resolveDatabaseUrl(): { url: string; source: DatabaseUrlSource } | null {
  const candidates: [DatabaseUrlSource, string | undefined][] = [
    ["DATABASE_URL", process.env.DATABASE_URL],
    ["DATABASE_PRIVATE_URL", process.env.DATABASE_PRIVATE_URL],
    ["POSTGRES_URL", process.env.POSTGRES_URL],
    ["POSTGRESQL_URL", process.env.POSTGRESQL_URL],
    ["PGURL", process.env.PGURL],
  ];

  for (const [source, raw] of candidates) {
    const url = raw?.trim();
    if (url) return { url, source };
  }

  return null;
}

export function parseDatabaseUrlSafe(
  connectionString: string,
  source: DatabaseUrlSource = "DATABASE_URL",
): SafeDatabaseTarget {
  const base: SafeDatabaseTarget = {
    source,
    host: null,
    port: null,
    database: null,
    user: null,
    sslmode: null,
    hasPassword: false,
    parseError: null,
  };

  try {
    const normalized = connectionString.replace(
      /^postgres(?:ql)?:\/\//i,
      "http://",
    );
    const u = new URL(normalized);
    base.host = u.hostname || null;
    base.port = u.port || null;
    base.database = u.pathname?.replace(/^\//, "") || null;
    base.user = u.username ? decodeURIComponent(u.username) : null;
    base.hasPassword = Boolean(u.password);
    base.sslmode = u.searchParams.get("sslmode");
    return base;
  } catch (err) {
    base.parseError = err instanceof Error ? err.message : String(err);
    return base;
  }
}

function classifyDbError(message: string, code?: string): DbConnectErrorKind {
  const m = message.toLowerCase();
  if (
    code === "ETIMEDOUT" ||
    code === "ECONNABORTED" ||
    m.includes("timeout") ||
    m.includes("timed out")
  ) {
    return "timeout";
  }
  if (code === "ENOTFOUND" || m.includes("getaddrinfo")) return "dns";
  if (code === "ECONNREFUSED" || m.includes("econnrefused")) return "refused";
  if (
    code === "28P01" ||
    m.includes("password authentication failed") ||
    m.includes("authentication failed")
  ) {
    return "auth";
  }
  if (m.includes("ssl") || m.includes("certificate")) return "ssl";
  if (m.includes("invalid") && m.includes("connection")) return "config";
  return "unknown";
}

export function formatDbConnectError(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) {
    return { kind: "unknown", message: String(err) };
  }

  const pg = err as Error & {
    code?: string;
    errno?: number;
    syscall?: string;
    address?: string;
    port?: number;
    severity?: string;
    routine?: string;
  };

  return {
    kind: classifyDbError(pg.message, pg.code),
    message: pg.message,
    code: pg.code ?? null,
    errno: pg.errno ?? null,
    syscall: pg.syscall ?? null,
    address: pg.address ?? null,
    port: pg.port ?? null,
    severity: pg.severity ?? null,
    routine: pg.routine ?? null,
  };
}
