/**
 * Thin adapter over swisseph-v2 (Swiss Ephemeris).
 *
 * Exposes two functions used by astrology.ts:
 *   sweBody(jd, key)         → { longitude, speed }
 *   sweHouses(jd, lat, lon)  → { cusps[12], ascendant, mc }
 *
 * The ephemeris data files are bundled with the swisseph-v2 package
 * (seas_18.se1, semo_18.se1, sepl_18.se1 — covers ~1800–2100 AD).
 */

import swisseph from "swisseph-v2";
import { createRequire } from "module";
import path from "path";
import fs from "fs";

// ── Ephemeris data path ────────────────────────────────────────────────────────
// pnpm keeps packages in a content-addressable store. We try multiple strategies
// to locate the bundled ephe/ directory reliably.
function findEphePath(): string {
  const _req = createRequire(import.meta.url);

  const candidates: string[] = [];

  // 1. Via require.resolve from this module's location
  try {
    candidates.push(
      path.join(path.dirname(_req.resolve("swisseph-v2/package.json")), "ephe"),
    );
  } catch { /* skip */ }

  // 2. Via native addon path (works even when package.json isn't resolvable)
  try {
    candidates.push(
      path.join(path.dirname(_req.resolve("swisseph-v2")), "..", "ephe"),
    );
  } catch { /* skip */ }

  // 3. Known pnpm store location (deterministic if version is pinned)
  candidates.push(
    "/workspace/node_modules/.pnpm/swisseph-v2@1.0.4/node_modules/swisseph-v2/ephe",
  );

  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "semo_18.se1"))) return c;
  }

  throw new Error(
    "swissephAdapter: cannot locate bundled ephemeris files.\n" +
    `Tried:\n${candidates.map(c => `  ${c}`).join("\n")}`,
  );
}

swisseph.swe_set_ephe_path(findEphePath());

// ── Flags ─────────────────────────────────────────────────────────────────────
// SEFLG_SWIEPH: use bundled Swiss Ephemeris files (compressed DE431, ~0.001″)
// SEFLG_SPEED:  return longitudinal speed so we can detect retrograde directly.
const FLAGS = (swisseph.SEFLG_SPEED | swisseph.SEFLG_SWIEPH) as number;

// ── Planet / body map ─────────────────────────────────────────────────────────
const BODY_MAP: Record<string, number> = {
  sun:       swisseph.SE_SUN       as number,
  moon:      swisseph.SE_MOON      as number,
  Mercury:   swisseph.SE_MERCURY   as number,
  Venus:     swisseph.SE_VENUS     as number,
  Mars:      swisseph.SE_MARS      as number,
  Jupiter:   swisseph.SE_JUPITER   as number,
  Saturn:    swisseph.SE_SATURN    as number,
  Uranus:    swisseph.SE_URANUS    as number,
  Neptune:   swisseph.SE_NEPTUNE   as number,
  Pluto:     swisseph.SE_PLUTO     as number,
  Chiron:    swisseph.SE_CHIRON    as number,
  northNode: swisseph.SE_MEAN_NODE as number,
  lilith:    swisseph.SE_MEAN_APOG as number,
};

export interface SweBodyResult {
  longitude: number;
  speed:     number;
}

export function sweBody(jd: number, key: string): SweBodyResult {
  const id = BODY_MAP[key];
  if (id === undefined) {
    throw new Error(`swissephAdapter.sweBody: unknown key "${key}"`);
  }
  const r = swisseph.swe_calc_ut(jd, id, FLAGS) as {
    longitude?: number; longitudeSpeed?: number; error?: string;
  };
  if (r.error) throw new Error(`swisseph swe_calc_ut("${key}") → ${r.error}`);
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
  const r = swisseph.swe_houses(jd, lat, lon, "P") as {
    house?: number[]; ascendant?: number; mc?: number; error?: string;
  };
  if (r.error) throw new Error(`swisseph swe_houses → ${r.error}`);
  const norm = (v: number) => (((v % 360) + 360) % 360);
  return {
    cusps:     (r.house ?? []).slice(0, 12).map(norm),
    ascendant: norm(r.ascendant ?? 0),
    mc:        norm(r.mc        ?? 0),
  };
}
