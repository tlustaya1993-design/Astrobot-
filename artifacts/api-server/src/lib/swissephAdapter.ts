/**
 * Thin, production-safe adapter over swisseph-v2 (Swiss Ephemeris).
 *
 * All imports of swisseph-v2 in the project MUST go through this module.
 * If the native addon fails to load (e.g. missing build tools on Railway),
 * the app continues to start; sweBody / sweHouses throw AstroEngineError
 * and the route layer returns a controlled error to the client.
 */

import { createRequire } from "module";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";

// ── Try to load the native addon synchronously ────────────────────────────────
const _require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _swe: any = null;

function findEphePath(): string | null {
  const candidates: string[] = [];
  try {
    candidates.push(
      path.join(path.dirname(_require.resolve("swisseph-v2/package.json")), "ephe"),
    );
  } catch { /* skip */ }
  try {
    candidates.push(
      path.join(path.dirname(_require.resolve("swisseph-v2")), "..", "ephe"),
    );
  } catch { /* skip */ }
  candidates.push(
    "/workspace/node_modules/.pnpm/swisseph-v2@1.0.4/node_modules/swisseph-v2/ephe",
  );
  return candidates.find(c => fs.existsSync(path.join(c, "semo_18.se1"))) ?? null;
}

/** True when the native Swiss Ephemeris addon loaded successfully. */
export let SWE_AVAILABLE = false;

try {
  _swe = _require("swisseph-v2");
  const ephePath = findEphePath();
  if (!ephePath) throw new Error("bundled ephe/ files not found");
  _swe.swe_set_ephe_path(ephePath);
  SWE_AVAILABLE = true;
  console.info("[SwissEph] ✅  loaded successfully — sub-arcsecond precision active");
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[SwissEph] ❌  failed to load: ${msg}`);
  console.error("[SwissEph]    Astrology functions will return a controlled error.");

  // ── Railway / CI env diagnostic ──────────────────────────────────────────
  // Check that node-gyp build prerequisites are present. This helps developers
  // diagnose missing build tools without reading the raw native addon error.
  const tools = ["python3", "gcc", "make"];
  const missing: string[] = [];
  for (const t of tools) {
    try { execSync(`which ${t}`, { stdio: "ignore" }); }
    catch { missing.push(t); }
  }
  try { _require("node-gyp"); }
  catch { missing.push("node-gyp (npm package)"); }

  if (missing.length > 0) {
    console.error(
      `[SwissEph]    Missing build prerequisites: ${missing.join(", ")}.\n` +
      `[SwissEph]    On Railway: add a Dockerfile/Nixpacks step to install ` +
      `build-essential + python3, then run 'npm rebuild swisseph-v2'.`,
    );
  }
}

// ── Error class ───────────────────────────────────────────────────────────────

export class AstroEngineError extends Error {
  readonly code = "ASTRO_ENGINE_UNAVAILABLE";
  constructor() {
    super(
      "Астрологический движок временно недоступен. " +
      "Проверь билд-зависимости сервера (swisseph-v2 native addon).",
    );
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

const FLAGS = SWE_AVAILABLE
  ? ((_swe.SEFLG_SPEED | _swe.SEFLG_SWIEPH) as number)
  : 0;

const BODY_MAP: Record<string, number> = SWE_AVAILABLE
  ? {
      sun:       _swe.SE_SUN       as number,
      moon:      _swe.SE_MOON      as number,
      Mercury:   _swe.SE_MERCURY   as number,
      Venus:     _swe.SE_VENUS     as number,
      Mars:      _swe.SE_MARS      as number,
      Jupiter:   _swe.SE_JUPITER   as number,
      Saturn:    _swe.SE_SATURN    as number,
      Uranus:    _swe.SE_URANUS    as number,
      Neptune:   _swe.SE_NEPTUNE   as number,
      Pluto:     _swe.SE_PLUTO     as number,
      Chiron:    _swe.SE_CHIRON    as number,
      northNode: _swe.SE_MEAN_NODE as number,
      lilith:    _swe.SE_MEAN_APOG as number,
    }
  : {};

export interface SweBodyResult {
  longitude: number;
  speed:     number;
}

export function sweBody(jd: number, key: string): SweBodyResult {
  if (!SWE_AVAILABLE) throw new AstroEngineError();
  const id = BODY_MAP[key];
  if (id === undefined) throw new Error(`swissephAdapter: unknown body key "${key}"`);
  const r = _swe.swe_calc_ut(jd, id, FLAGS) as {
    longitude?: number; longitudeSpeed?: number; error?: string;
  };
  if (r.error) throw new Error(`swe_calc_ut("${key}") → ${r.error}`);
  return {
    longitude: (((r.longitude ?? 0) % 360) + 360) % 360,
    speed:     r.longitudeSpeed ?? 0,
  };
}

export interface SweHouseResult {
  cusps:     number[];
  ascendant: number;
  mc:        number;
}

export function sweHouses(jd: number, lat: number, lon: number): SweHouseResult {
  if (!SWE_AVAILABLE) throw new AstroEngineError();
  const r = _swe.swe_houses(jd, lat, lon, "P") as {
    house?: number[]; ascendant?: number; mc?: number; error?: string;
  };
  if (r.error) throw new Error(`swe_houses → ${r.error}`);
  const norm = (v: number) => (((v % 360) + 360) % 360);
  return {
    cusps:     (r.house ?? []).slice(0, 12).map(norm),
    ascendant: norm(r.ascendant ?? 0),
    mc:        norm(r.mc        ?? 0),
  };
}
