/**
 * Ephemeris accuracy test.
 *
 * Ground truth: Swiss Ephemeris (swisseph-v2) with the same JD our code
 * uses — both calculated at 12:00 UT (noon) so the comparison is apples-to-apples.
 */

import { describe, it, expect } from "vitest";
import swisseph from "swisseph-v2";
import { calcNatalChart } from "../astrology.js";

// ─── Swiss Ephemeris setup ────────────────────────────────────────────────────
// The ephe path is set by swissephAdapter.ts (imported transitively via astrology.ts).
// We must NOT call swe_set_ephe_path here — it would overwrite the adapter's
// correct path with a wrong relative one.
const SWE_FLAGS = swisseph.SEFLG_SPEED | swisseph.SEFLG_SWIEPH;

const SWE_IDS: Record<string, number> = {
  Солнце:   swisseph.SE_SUN,
  Луна:     swisseph.SE_MOON,
  Меркурий: swisseph.SE_MERCURY,
  Венера:   swisseph.SE_VENUS,
  Марс:     swisseph.SE_MARS,
  Юпитер:   swisseph.SE_JUPITER,
  Сатурн:   swisseph.SE_SATURN,
  Уран:     swisseph.SE_URANUS,
  Нептун:   swisseph.SE_NEPTUNE,
  Плутон:   swisseph.SE_PLUTO,
};

function swePositionAt(jd: number, name: string): number {
  const id = SWE_IDS[name];
  if (id === undefined) throw new Error(`No SWE id for ${name}`);
  const r = swisseph.swe_calc_ut(jd, id, SWE_FLAGS) as { longitude?: number; error?: string };
  if (r.error || r.longitude === undefined) throw new Error(`SWE error for ${name}: ${r.error}`);
  return r.longitude;
}

function sweJd(year: number, month: number, day: number, hour = 12.0): number {
  const r = swisseph.swe_julday(year, month, day, hour, swisseph.SE_GREG_CAL) as number | { julianDay?: number };
  return typeof r === "number" ? r : (r as { julianDay?: number }).julianDay ?? 0;
}

function angularDiff(a: number, b: number): number {
  const d = Math.abs(((a - b) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

const SIGNS_RU = ["Овен","Телец","Близнецы","Рак","Лев","Дева","Весы","Скорпион","Стрелец","Козерог","Водолей","Рыбы"];
const signOf = (lon: number) => SIGNS_RU[Math.floor(((lon % 360) + 360) % 360 / 30)];

// ─── Tolerances ───────────────────────────────────────────────────────────────
const TOLERANCES: Record<string, number> = {
  Солнце: 0.5, Луна: 2.0, Меркурий: 1.0, Венера: 1.0, Марс: 1.0,
  Юпитер: 1.5, Сатурн: 1.5, Уран: 2.0, Нептун: 2.0, Плутон: 3.0,
};
const PLANETS = Object.keys(SWE_IDS);

// ─── Test cases ───────────────────────────────────────────────────────────────
const CASES = [
  { label: "1970-01-01 12:00 UT (peak boomer)", date: "1970-01-01", y:1970, m:1,  d:1  },
  { label: "1961-01-01 12:00 UT (early boomer)",date: "1961-01-01", y:1961, m:1,  d:1  },
  { label: "1985-07-13 12:00 UT (millennial)",  date: "1985-07-13", y:1985, m:7,  d:13 },
  { label: "1975-06-21 12:00 UT (mid-70s)",     date: "1975-06-21", y:1975, m:6,  d:21 },
];

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("Ephemeris accuracy: internal code vs Swiss Ephemeris (JPL DE431)", () => {
  for (const tc of CASES) {
    it(tc.label, () => {
      // Our code: no location → no timezone conversion, time used as-is.
      // Using null time → code defaults to 12:00 UT internally.
      const chart = calcNatalChart(tc.date, null, null, null);

      // Swiss Ephemeris: compute at noon UT for the same date.
      const jd = sweJd(tc.y, tc.m, tc.d, 12.0);

      console.log(`\n── ${tc.label} (JD=${jd.toFixed(1)}) ──`);
      console.log("Planet       Our code   Swiss Eph   Error   Tol   Sign");
      console.log("────────────────────────────────────────────────────────");

      let maxErr = 0, maxPlanet = "";

      for (const name of PLANETS) {
        const ours = chart.planets.find(p => p.planet === name);
        if (!ours) { console.log(`${name.padEnd(12)} NOT IN CHART`); continue; }

        const swe  = swePositionAt(jd, name);
        const err  = angularDiff(ours.longitude, swe);
        const tol  = TOLERANCES[name];
        const pass = err <= tol;
        const signOk = signOf(ours.longitude) === signOf(swe)
          ? "✓ same"
          : `✗ SIGN MISMATCH (ours=${signOf(ours.longitude)}, swe=${signOf(swe)})`;

        if (err > maxErr) { maxErr = err; maxPlanet = name; }

        console.log(
          `${name.padEnd(12)} ${ours.longitude.toFixed(2).padStart(7)}°` +
          `  ${swe.toFixed(2).padStart(7)}°  ${err.toFixed(2).padStart(5)}°` +
          `  ${tol}°  ${pass ? "✓" : "✗"} ${signOk}`
        );

        expect(
          err,
          `${name}: our=${ours.longitude.toFixed(2)}° swe=${swe.toFixed(2)}° diff=${err.toFixed(2)}°`,
        ).toBeLessThanOrEqual(tol);
      }

      console.log(`\n  Max error: ${maxErr.toFixed(2)}° (${maxPlanet})`);
    });
  }
});
