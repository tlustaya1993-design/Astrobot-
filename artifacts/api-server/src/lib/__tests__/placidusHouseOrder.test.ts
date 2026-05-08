import { describe, it, expect } from "vitest";
import { calcNatalChart } from "../astrology.js";

// Validates: MC → H11 → H12 → ASC and ASC → H2 → H3 → IC (all strictly ordered, mod 360).
// Array layout returned by calcNatalChart: [ASC(0), H2(1), H3(2), IC(3), …, MC(9), H11(10), H12(11)]
function fwd(from: number, to: number): number {
  return ((to - from) + 360) % 360;
}

// Verifies strict ordering of intermediate cusps.
// Span < 1° is a separate concern — those charts are rejected by validateNatalChart
// (housesValid: false → house layer suppressed), so we don't test it here.
function checkHouseOrder(houses: number[]): void {
  const asc = houses[0];
  const mc  = houses[9];
  const ic  = houses[3];
  const h11 = houses[10];
  const h12 = houses[11];
  const h2  = houses[1];
  const h3  = houses[2];

  const mcAscArc = fwd(mc, asc);
  const ascIcArc = fwd(asc, ic);

  const d11 = fwd(mc, h11);
  const d12 = fwd(mc, h12);
  const e2  = fwd(asc, h2);
  const e3  = fwd(asc, h3);

  // MC → H11 → H12 → ASC
  expect(d11, "H11 must be ahead of MC").toBeGreaterThan(0);
  expect(d11, "H11 must be before H12").toBeLessThan(d12);
  expect(d12, "H12 must be before ASC").toBeLessThan(mcAscArc);

  // ASC → H2 → H3 → IC
  expect(e2, "H2 must be ahead of ASC").toBeGreaterThan(0);
  expect(e2, "H2 must be before H3").toBeLessThan(e3);
  expect(e3, "H3 must be before IC").toBeLessThan(ascIcArc);
}

describe("Placidus house order invariant — full RAMC sweep", () => {
  // 48 birth times across 24 hours covers the full RAMC range.
  // Moscow lat=55.75 is in the zone where the old sequential guard could fail.
  const TIMES: string[] = Array.from({ length: 48 }, (_, i) => {
    const totalMins = i * 30;
    const h = Math.floor(totalMins / 60).toString().padStart(2, "0");
    const m = (totalMins % 60).toString().padStart(2, "0");
    return `${h}:${m}`;
  });

  for (const time of TIMES) {
    it(`Moscow 2000-01-15 ${time}`, () => {
      const chart = calcNatalChart("2000-01-15", time, 55.75, 37.62);
      expect(chart.houses).not.toBeNull();
      checkHouseOrder(chart.houses!);
    });

    it(`St. Petersburg 2000-06-21 ${time}`, () => {
      const chart = calcNatalChart("2000-06-21", time, 59.95, 30.32);
      expect(chart.houses).not.toBeNull();
      checkHouseOrder(chart.houses!);
    });
  }

  // High-latitude cities well below the polar fallback (|lat| = 64–65°)
  const HIGH_LAT_CITIES = [
    { name: "Oulu, Finland",  lat: 65.01, lon: 25.47 },
    { name: "Fairbanks, AK",  lat: 64.84, lon: -147.72 },
  ];
  for (const city of HIGH_LAT_CITIES) {
    for (const time of ["00:00", "06:00", "12:00", "18:00"]) {
      it(`${city.name} 2000-03-20 ${time}`, () => {
        const chart = calcNatalChart("2000-03-20", time, city.lat, city.lon);
        expect(chart.houses).not.toBeNull();
        checkHouseOrder(chart.houses!);
      });
    }
  }

  // Southern hemisphere
  it("Sydney 1985-07-04 03:00", () => {
    const chart = calcNatalChart("1985-07-04", "03:00", -33.87, 151.21);
    expect(chart.houses).not.toBeNull();
    checkHouseOrder(chart.houses!);
  });
});
