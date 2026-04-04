#!/usr/bin/env python3
"""
Normalize preset avatars: detect the inner gold frame circle, scale so it has a fixed
radius, center on a square canvas, write PNG.

Usage (from repo root):
  pip install -r scripts/requirements-avatar-normalize.txt
  python scripts/normalize_avatar_circles.py --apply

Default is dry-run; use --apply to overwrite files. Use --inputs to add more globs.
"""

from __future__ import annotations

import argparse
import glob
import os
import sys
from pathlib import Path

import cv2
import numpy as np

# HSV (OpenCV: H 0–179): золотая рамка
_GOLD_HSV_LOW = np.array([10, 50, 70], dtype=np.uint8)
_GOLD_HSV_HIGH = np.array([40, 255, 255], dtype=np.uint8)
_MORPH_CLOSE = 21

# Допустимый радиус относительно min(w,h)
_R_MIN_FRAC = 0.16
_R_MAX_FRAC = 0.50


def _read_bgra(path: str) -> np.ndarray:
    im = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if im is None:
        raise FileNotFoundError(path)
    if im.ndim == 2:
        im = cv2.cvtColor(im, cv2.COLOR_GRAY2BGRA)
    elif im.shape[2] == 3:
        im = cv2.cvtColor(im, cv2.COLOR_BGR2BGRA)
    return im


def _circle_from_gold_mask(bgr: np.ndarray) -> tuple[float, float, float] | None:
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, _GOLD_HSV_LOW, _GOLD_HSV_HIGH)
    k = np.ones((_MORPH_CLOSE, _MORPH_CLOSE), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k)
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None
    c = max(cnts, key=cv2.contourArea)
    area = cv2.contourArea(c)
    if area < (bgr.shape[0] * bgr.shape[1] * 0.002):
        return None
    (x, y), r = cv2.minEnclosingCircle(c)
    return float(x), float(y), float(r)


def _circle_from_hough(gray: np.ndarray) -> tuple[float, float, float] | None:
    h, w = gray.shape
    g = cv2.GaussianBlur(gray, (9, 9), 0)
    min_dim = min(h, w)
    minr = max(10, int(min_dim * _R_MIN_FRAC))
    maxr = int(min_dim * _R_MAX_FRAC)
    circles = cv2.HoughCircles(
        g,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=min_dim // 2,
        param1=100,
        param2=28,
        minRadius=minr,
        maxRadius=maxr,
    )
    if circles is None:
        return None
    cx_img, cy_img = w / 2, h / 2
    best = min(
        circles[0],
        key=lambda t: float((t[0] - cx_img) ** 2 + (t[1] - cy_img) ** 2),
    )
    return float(best[0]), float(best[1]), float(best[2])


def _circle_from_fg_flood(gray: np.ndarray, thresh: int) -> tuple[float, float, float] | None:
    """Тёмное «поле» снаружи кольца, связанное с краем (у PNG с чёрными углами)."""
    h, w = gray.shape
    black = (gray < thresh).astype(np.uint8) * 255
    filled = black.copy()
    mask = np.zeros((h + 2, w + 2), dtype=np.uint8)
    for x in range(w):
        for y in (0, h - 1):
            if filled[y, x] == 255:
                cv2.floodFill(filled, mask, (x, y), 64)
    for y in range(h):
        for x in (0, w - 1):
            if filled[y, x] == 255:
                cv2.floodFill(filled, mask, (x, y), 64)
    border_black = filled == 64
    fg = ((gray >= thresh) | ((gray < thresh) & ~border_black)).astype(np.uint8) * 255
    cnts, _ = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None
    c = max(cnts, key=cv2.contourArea)
    if cv2.contourArea(c) < h * w * 0.05:
        return None
    (x, y), r = cv2.minEnclosingCircle(c)
    return float(x), float(y), float(r)


def detect_circle(bgr: np.ndarray) -> tuple[float, float, float]:
    h, w = bgr.shape[:2]
    min_dim = float(min(w, h))

    def ok(cx: float, cy: float, r: float) -> bool:
        if r < min_dim * _R_MIN_FRAC or r > min_dim * _R_MAX_FRAC:
            return False
        m = min_dim * 0.06
        if cx < -m or cy < -m or cx > w + m or cy > h + m:
            return False
        return True

    gold = _circle_from_gold_mask(bgr)
    if gold and ok(*gold):
        return gold

    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    hough = _circle_from_hough(gray)
    if hough and ok(*hough):
        return hough

    for th in (25, 40, 60, 80, 100):
        fg = _circle_from_fg_flood(gray, th)
        if fg and ok(*fg):
            return fg

    if gold:
        return gold
    if hough:
        return hough

    cx, cy = w / 2, h / 2
    r = min_dim * 0.42
    return cx, cy, r


def warp_to_square_canvas(
    bgra: np.ndarray,
    cx: float,
    cy: float,
    r: float,
    canvas: int,
    target_r: float,
) -> np.ndarray:
    if r < 1e-3:
        raise ValueError("radius too small")
    s = target_r / r
    m = np.float32([[s, 0, canvas / 2 - s * cx], [0, s, canvas / 2 - s * cy]])
    return cv2.warpAffine(
        bgra,
        m,
        (canvas, canvas),
        flags=cv2.INTER_LANCZOS4,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0, 0),
    )


def process_file(path: str, canvas: int, target_r: float, apply: bool) -> dict:
    p = Path(path)
    bgra = _read_bgra(str(p))
    bgr = bgra[:, :, :3]
    cx, cy, r = detect_circle(bgr)
    out = warp_to_square_canvas(bgra, cx, cy, r, canvas, target_r)
    rel = p.as_posix()
    result = {
        "path": rel,
        "in_wh": (bgra.shape[1], bgra.shape[0]),
        "circle": (round(cx, 1), round(cy, 1), round(r, 1)),
        "canvas": canvas,
        "target_r": target_r,
    }
    if apply:
        tmp = p.with_name(f"{p.stem}._norm_write_.png")
        ok = cv2.imwrite(str(tmp), out, [cv2.IMWRITE_PNG_COMPRESSION, 9])
        if not ok:
            raise RuntimeError(f"imwrite failed: {tmp}")
        os.replace(tmp, p)
    return result


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser(description="Normalize avatar PNGs to a square canvas.")
    ap.add_argument(
        "--apply",
        action="store_true",
        help="Write files (default: dry-run)",
    )
    ap.add_argument("--canvas", type=int, default=1024, help="Output square size (px)")
    ap.add_argument(
        "--target-r",
        type=float,
        default=470.0,
        help="Target circle radius in output pixels (center = canvas/2). "
        "If you change --canvas or this value, update MAGE_* constants in IllustratedAvatar.tsx.",
    )
    ap.add_argument(
        "--inputs",
        nargs="*",
        default=[],
        help="Extra glob patterns (relative to repo root)",
    )
    args = ap.parse_args()

    default_globs = [
        "artifacts/astrobot/public/avatar-presets/mage/*.png",
        "artifacts/astrobot/public/avatar-presets/volshebnitsa.png",
    ]
    patterns = default_globs + args.inputs
    files: list[str] = []
    for pat in patterns:
        g = sorted(glob.glob(str(root / pat)))
        files.extend(g)

    seen = set()
    unique: list[str] = []
    for f in files:
        rp = str(Path(f).resolve())
        if rp not in seen and f.lower().endswith(".png"):
            seen.add(rp)
            unique.append(rp)

    if not unique:
        print("No PNG files matched.", file=sys.stderr)
        return 1

    os.chdir(root)
    mode = "WRITE" if args.apply else "DRY-RUN"
    print(f"{mode}: canvas={args.canvas} target_r={args.target_r}  ({len(unique)} files)")

    for f in unique:
        try:
            info = process_file(f, args.canvas, args.target_r, args.apply)
            print(
                f"  OK {info['path']}  {info['in_wh']} -> circle{info['circle']}",
            )
        except Exception as e:
            print(f"  FAIL {f}: {e}", file=sys.stderr)
            return 1

    if not args.apply:
        print("Dry-run only. Re-run with --apply to overwrite PNGs.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
