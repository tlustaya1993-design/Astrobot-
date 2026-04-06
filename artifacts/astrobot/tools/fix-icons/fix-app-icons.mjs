/**
 * Fixes PWA / iOS icon: light fringe on edges + optical centering.
 *
 * Run from this folder after npm install:
 *   cd artifacts/astrobot/tools/fix-icons && npm install && node fix-app-icons.mjs
 */
import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "..", "public");

const BG = { r: 10, g: 10, b: 20, alpha: 1 }; // #0a0a14

/** Lower = repaint more near-black greys on the rim (kills faint white fringe). */
const EDGE_LUMA_THRESHOLD = 28;

function luma(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function edgeFixRgba(buf, w, h, ringPx) {
  const out = Buffer.from(buf);
  const inRing = (x, y) =>
    x < ringPx || y < ringPx || x >= w - ringPx || y >= h - ringPx;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inRing(x, y)) continue;
      const i = (y * w + x) * 4;
      const r = out[i];
      const g = out[i + 1];
      const b = out[i + 2];
      if (luma(r, g, b) > EDGE_LUMA_THRESHOLD) {
        out[i] = BG.r;
        out[i + 1] = BG.g;
        out[i + 2] = BG.b;
        out[i + 3] = 255;
      }
    }
  }
  return out;
}

/** Solid frame depth px — kills fringe from glow when OS scales the icon. */
function paintOuterFrame(buf, w, h, depthPx) {
  const out = Buffer.from(buf);
  const d = Math.max(1, Math.min(depthPx, Math.floor(Math.min(w, h) / 4)));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < d || y < d || x >= w - d || y >= h - d) {
        const i = (y * w + x) * 4;
        out[i] = BG.r;
        out[i + 1] = BG.g;
        out[i + 2] = BG.b;
        out[i + 3] = 255;
      }
    }
  }
  return out;
}

async function processIcon(
  relPath,
  { ringPx = 2, shiftNormX = 5, shiftNormY = 4, frameDepth = 2 } = {},
) {
  const abs = join(publicDir, relPath);
  const base = sharp(abs).ensureAlpha();
  const meta = await base.metadata();
  const w = meta.width;
  const h = meta.height;
  if (!w || !h) throw new Error(`${relPath}: bad dimensions`);

  const { data } = await base.raw().toBuffer({ resolveWithObject: true });
  if (data.length !== w * h * 4) throw new Error(`${relPath}: expected RGBA`);

  const fixed = await edgeFixRgba(data, w, h, ringPx);
  const inner = await sharp(fixed, {
    raw: { width: w, height: h, channels: 4 },
  })
    .png()
    .toBuffer();

  const sx = Math.max(1, Math.round((shiftNormX * w) / 180));
  const sy = Math.max(1, Math.round((shiftNormY * h) / 180));

  const composed = await sharp({
    create: { width: w, height: h, channels: 4, background: BG },
  })
    .composite([{ input: inner, left: sx, top: sy }])
    .png()
    .toBuffer();

  const after = sharp(composed).ensureAlpha();
  const { data: outData } = await after.raw().toBuffer({ resolveWithObject: true });
  const rim = Math.min(3, Math.floor(Math.min(w, h) / 24) + 1);
  let finalRgb = await edgeFixRgba(outData, w, h, rim);
  finalRgb = paintOuterFrame(finalRgb, w, h, frameDepth);

  const outBuf = await sharp(finalRgb, {
    raw: { width: w, height: h, channels: 4 },
  })
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer();

  await writeFile(abs, outBuf);
  console.log("OK", relPath, `${w}x${h}`, `shift +${sx},+${sy}`);
}

const targets = [
  { path: "apple-touch-icon.png", ringPx: 3, shiftNormX: 9, shiftNormY: 4, frameDepth: 2 },
  { path: "favicon.png", ringPx: 3, shiftNormX: 9, shiftNormY: 4, frameDepth: 2 },
  { path: "favicon-32.png", ringPx: 2, shiftNormX: 2, shiftNormY: 2, frameDepth: 1 },
  { path: "favicon-48.png", ringPx: 2, shiftNormX: 2, shiftNormY: 2, frameDepth: 1 },
  { path: "icons/astrobot-192.png", ringPx: 3, shiftNormX: 9, shiftNormY: 4, frameDepth: 2 },
  { path: "icons/astrobot-512.png", ringPx: 3, shiftNormX: 9, shiftNormY: 4, frameDepth: 2 },
];

for (const t of targets) {
  await processIcon(t.path, {
    ringPx: t.ringPx,
    shiftNormX: t.shiftNormX,
    shiftNormY: t.shiftNormY,
    frameDepth: t.frameDepth ?? 2,
  });
}

console.log("Done.");
