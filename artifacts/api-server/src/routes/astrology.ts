import { Router, type IRouter } from "express";
import {
  calcNatalChart, calcEphemeris, calcSynastry, calcSolarReturn, calcProgressions,
  formatNatalForPrompt, formatEphemerisForPrompt, formatSynastryForPrompt,
  formatSolarReturnForPrompt, formatProgressionsForPrompt,
} from "../lib/astrology.js";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getUserChart(sessionId: string) {
  const [user] = await db.select().from(usersTable)
    .where(eq(usersTable.sessionId, sessionId)).limit(1);
  if (!user?.birthDate) return null;
  const lat = user.birthLat ? parseFloat(String(user.birthLat)) : null;
  const lon = user.birthLng ? parseFloat(String(user.birthLng)) : null;
  return { user, chart: calcNatalChart(user.birthDate, user.birthTime ?? null, lat, lon) };
}

// ─── Natal ────────────────────────────────────────────────────────────────────

router.get("/natal", async (req, res) => {
  const sessionId = req.headers["x-session-id"] as string | undefined;
  if (!sessionId) { res.status(400).json({ error: "x-session-id required" }); return; }

  const result = await getUserChart(sessionId);
  if (!result) { res.status(400).json({ error: "Birth date not set" }); return; }

  res.json({ ...result.chart, formatted: formatNatalForPrompt(result.chart) });
});

// ─── Ephemeris ────────────────────────────────────────────────────────────────

router.get("/ephemeris", async (req, res) => {
  const sessionId = req.headers["x-session-id"] as string | undefined;
  let natalChart = undefined;
  if (sessionId) {
    const result = await getUserChart(sessionId);
    natalChart = result?.chart;
  }
  const ephem = calcEphemeris(natalChart);
  res.json({ ...ephem, formatted: formatEphemerisForPrompt(ephem, natalChart) });
});

// ─── Synastry ─────────────────────────────────────────────────────────────────

router.post("/synastry", (req, res) => {
  const { personA, personB } = req.body as {
    personA: { birthDate: string; birthTime?: string; birthLat?: number; birthLng?: number; name?: string };
    personB: { birthDate: string; birthTime?: string; birthLat?: number; birthLng?: number; name?: string };
  };
  if (!personA?.birthDate || !personB?.birthDate) {
    res.status(400).json({ error: "birthDate required for both persons" }); return;
  }
  try {
    const chartA  = calcNatalChart(personA.birthDate, personA.birthTime ?? null, personA.birthLat ?? null, personA.birthLng ?? null);
    const chartB  = calcNatalChart(personB.birthDate, personB.birthTime ?? null, personB.birthLat ?? null, personB.birthLng ?? null);
    const synastry = calcSynastry(chartA, chartB);
    const nameA   = personA.name ?? "Человек А";
    const nameB   = personB.name ?? "Человек Б";
    res.json({
      chartA:   { ...chartA, formatted: formatNatalForPrompt(chartA) },
      chartB:   { ...chartB, formatted: formatNatalForPrompt(chartB) },
      synastry,
      formatted: formatSynastryForPrompt(nameA, nameB, synastry),
    });
  } catch (err) {
    res.status(500).json({ error: "Calculation failed", details: String(err) });
  }
});

// ─── Solar Return ─────────────────────────────────────────────────────────────

router.get("/solar-return", async (req, res) => {
  const sessionId = req.headers["x-session-id"] as string | undefined;
  if (!sessionId) { res.status(400).json({ error: "x-session-id required" }); return; }

  const yearParam = req.query.year as string | undefined;
  const result    = await getUserChart(sessionId);
  if (!result) { res.status(400).json({ error: "Birth date not set" }); return; }

  const { user } = result;
  const lat  = user.birthLat ? parseFloat(String(user.birthLat)) : null;
  const lon  = user.birthLng ? parseFloat(String(user.birthLng)) : null;
  const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();

  try {
    const sr = calcSolarReturn(user.birthDate!, user.birthTime ?? null, lat, lon, year);
    res.json({ ...sr, formatted: formatSolarReturnForPrompt(sr) });
  } catch (err) {
    res.status(500).json({ error: "Solar return calculation failed", details: String(err) });
  }
});

// ─── Progressions ─────────────────────────────────────────────────────────────

router.get("/progressions", async (req, res) => {
  const sessionId = req.headers["x-session-id"] as string | undefined;
  if (!sessionId) { res.status(400).json({ error: "x-session-id required" }); return; }

  const result = await getUserChart(sessionId);
  if (!result) { res.status(400).json({ error: "Birth date not set" }); return; }

  const { user } = result;
  const lat   = user.birthLat ? parseFloat(String(user.birthLat)) : null;
  const lon   = user.birthLng ? parseFloat(String(user.birthLng)) : null;

  const birthYear = parseInt(user.birthDate!.split("-")[0]);
  const age       = new Date().getFullYear() - birthYear;

  try {
    const prog = calcProgressions(user.birthDate!, user.birthTime ?? null, lat, lon, age);
    res.json({ ...prog, formatted: formatProgressionsForPrompt(prog) });
  } catch (err) {
    res.status(500).json({ error: "Progressions calculation failed", details: String(err) });
  }
});

export default router;
