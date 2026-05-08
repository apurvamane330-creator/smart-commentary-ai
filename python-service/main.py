"""
AI Voice Commentary Dashboard - Python Analysis Service
========================================================

A FastAPI service that performs OCR + computer-vision extraction on dashboard
screenshots and returns structured JSON. The TanStack server function
(`src/lib/analyze.functions.ts`) sends image data to this service and feeds
the result to Gemini as ground truth.

Deploy on: Render / Railway / Fly.io / your own VM (NOT inside Lovable —
Lovable's runtime is a Cloudflare Worker and cannot run Python).

----------------------------------------------------------
Environment variables
----------------------------------------------------------
  AUTH_TOKEN      Shared bearer token. Must equal PYTHON_ANALYSIS_TOKEN
                  configured in Lovable Cloud secrets.
  PORT            Port to bind (default 8000). Render/Railway set this.

----------------------------------------------------------
Endpoint
----------------------------------------------------------
  POST /analyze
    Headers: Authorization: Bearer <AUTH_TOKEN>
    Body:    { "image_base64": "data:image/...;base64,..." OR raw base64,
               "image_url": "https://..." }
    Returns: {
      "ocr_text":      "<all detected text>",
      "text_blocks":   [{ "text": str, "bbox": [x,y,w,h], "conf": float }, ...],
      "kpis":          [{ "label": str, "value": str }, ...],
      "numbers":       [float, ...],
      "percentages":   [float, ...],
      "currency":      [str, ...],
      "dates":         [str, ...],
      "colors":        [{ "rgb": [r,g,b], "ratio": float }, ...],
      "chart_regions": [{ "bbox": [x,y,w,h], "type": "bar|line|pie|table|unknown" }],
      "image_size":    [w, h],
      "summary_hint":  "<short auto summary used as Gemini hint>"
    }

----------------------------------------------------------
Local run
----------------------------------------------------------
  python -m venv .venv && source .venv/bin/activate
  pip install -r requirements.txt
  export AUTH_TOKEN=your-shared-token
  uvicorn main:app --host 0.0.0.0 --port 8000

----------------------------------------------------------
Docker
----------------------------------------------------------
  docker build -t dashboard-analyzer .
  docker run -p 8000:8000 -e AUTH_TOKEN=your-shared-token dashboard-analyzer
"""

from __future__ import annotations

import base64
import io
import os
import re
from collections import Counter
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel, Field

# EasyOCR is heavier but more accurate than Tesseract on dashboard screenshots
# and works without system binaries (pure pip install).
import easyocr

AUTH_TOKEN = os.environ.get("AUTH_TOKEN", "")

app = FastAPI(title="Dashboard Analyzer", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

# Lazily initialise the reader so the container starts fast and the model
# downloads on first request (cached afterwards).
_reader: easyocr.Reader | None = None


def get_reader() -> easyocr.Reader:
    global _reader
    if _reader is None:
        _reader = easyocr.Reader(["en"], gpu=False, verbose=False)
    return _reader


# ----------------------------- Schemas -----------------------------------


class AnalyzeRequest(BaseModel):
    image_base64: str = Field(..., description="Data URL or raw base64 PNG/JPEG")
    image_url: str | None = None


# ----------------------------- Helpers -----------------------------------


def decode_image(b64: str) -> np.ndarray:
    if "," in b64 and b64.strip().startswith("data:"):
        b64 = b64.split(",", 1)[1]
    raw = base64.b64decode(b64)
    pil = Image.open(io.BytesIO(raw)).convert("RGB")
    return cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)


NUM_RE = re.compile(r"-?\d{1,3}(?:[,_]\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?")
PCT_RE = re.compile(r"-?\d+(?:\.\d+)?\s*%")
CUR_RE = re.compile(r"(?:\$|€|£|¥|₹|USD|EUR|GBP|INR)\s?-?\d[\d,\.]*\s?[KkMmBb]?")
DATE_RE = re.compile(
    r"\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{2,4}|"
    r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s\d{1,2},?\s\d{2,4})\b",
    re.IGNORECASE,
)


def parse_number(s: str) -> float | None:
    try:
        return float(s.replace(",", "").replace("_", ""))
    except ValueError:
        return None


def extract_text(img: np.ndarray) -> tuple[str, list[dict[str, Any]]]:
    reader = get_reader()
    raw = reader.readtext(img, detail=1, paragraph=False)
    blocks: list[dict[str, Any]] = []
    for box, text, conf in raw:
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        x, y = int(min(xs)), int(min(ys))
        w, h = int(max(xs) - x), int(max(ys) - y)
        blocks.append(
            {
                "text": text.strip(),
                "bbox": [x, y, w, h],
                "conf": round(float(conf), 3),
            }
        )
    full_text = "\n".join(b["text"] for b in blocks if b["text"])
    return full_text, blocks


def pair_kpis(blocks: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Heuristic: pair a numeric block with the nearest non-numeric label
    above or to the left (typical KPI card layout)."""
    numerics: list[dict[str, Any]] = []
    labels: list[dict[str, Any]] = []
    for b in blocks:
        t = b["text"]
        if not t:
            continue
        if NUM_RE.fullmatch(t.replace(" ", "")) or PCT_RE.fullmatch(t.replace(" ", "")) or CUR_RE.fullmatch(t.replace(" ", "")):
            numerics.append(b)
        else:
            labels.append(b)

    kpis: list[dict[str, str]] = []
    for n in numerics:
        nx, ny, nw, nh = n["bbox"]
        ncx, ncy = nx + nw / 2, ny + nh / 2
        best, best_d = None, float("inf")
        for l in labels:
            lx, ly, lw, lh = l["bbox"]
            lcx, lcy = lx + lw / 2, ly + lh / 2
            # Prefer labels above (smaller y) or to the left (smaller x).
            if lcy > ncy + nh and lcx > ncx + nw:
                continue
            d = (ncx - lcx) ** 2 + (ncy - lcy) ** 2
            if d < best_d:
                best, best_d = l, d
        if best is not None:
            kpis.append({"label": best["text"], "value": n["text"]})
    return kpis


def dominant_colors(img: np.ndarray, k: int = 5) -> list[dict[str, Any]]:
    small = cv2.resize(img, (120, 120), interpolation=cv2.INTER_AREA)
    pixels = small.reshape(-1, 3).astype(np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _, labels, centers = cv2.kmeans(pixels, k, None, criteria, 3, cv2.KMEANS_PP_CENTERS)
    counts = Counter(labels.flatten().tolist())
    total = sum(counts.values())
    out = []
    for idx, count in counts.most_common():
        b, g, r = centers[idx].astype(int).tolist()
        out.append({"rgb": [int(r), int(g), int(b)], "ratio": round(count / total, 3)})
    return out


def detect_chart_regions(img: np.ndarray) -> list[dict[str, Any]]:
    """Very lightweight region proposal: large rectangular contours with
    decent contrast typically correspond to chart panels."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 60, 180)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=2)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    h, w = img.shape[:2]
    min_area = (w * h) * 0.02
    regions = []
    for c in contours:
        x, y, cw, ch = cv2.boundingRect(c)
        if cw * ch < min_area or cw < 60 or ch < 60:
            continue
        regions.append({"bbox": [int(x), int(y), int(cw), int(ch)], "type": "unknown"})
    # Keep top 8 largest panels.
    regions.sort(key=lambda r: r["bbox"][2] * r["bbox"][3], reverse=True)
    return regions[:8]


def build_summary_hint(kpis: list[dict[str, str]], numbers: list[float], pct: list[float]) -> str:
    parts = []
    if kpis:
        top = ", ".join(f"{k['label']}: {k['value']}" for k in kpis[:5])
        parts.append(f"Detected KPIs — {top}.")
    if pct:
        parts.append(f"Notable percentages: {', '.join(f'{p}%' for p in pct[:5])}.")
    if numbers:
        parts.append(f"Numeric range: {min(numbers):g} to {max(numbers):g}.")
    return " ".join(parts) or "No structured KPIs detected."


# ----------------------------- Routes ------------------------------------


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze")
def analyze(req: AnalyzeRequest, authorization: str | None = Header(None)) -> dict[str, Any]:
    if AUTH_TOKEN:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(401, "Missing bearer token")
        if authorization.split(" ", 1)[1].strip() != AUTH_TOKEN:
            raise HTTPException(403, "Invalid token")

    try:
        img = decode_image(req.image_base64)
    except Exception as e:
        raise HTTPException(400, f"Invalid image: {e}")

    h, w = img.shape[:2]
    full_text, blocks = extract_text(img)

    numbers = [n for n in (parse_number(m) for m in NUM_RE.findall(full_text)) if n is not None]
    percentages = [parse_number(m.replace("%", "").strip()) for m in PCT_RE.findall(full_text)]
    percentages = [p for p in percentages if p is not None]
    currency = CUR_RE.findall(full_text)
    dates = DATE_RE.findall(full_text)
    kpis = pair_kpis(blocks)
    colors = dominant_colors(img)
    chart_regions = detect_chart_regions(img)
    summary_hint = build_summary_hint(kpis, numbers, percentages)

    return {
        "ocr_text": full_text,
        "text_blocks": blocks,
        "kpis": kpis,
        "numbers": numbers[:50],
        "percentages": percentages[:30],
        "currency": currency[:30],
        "dates": dates[:30],
        "colors": colors,
        "chart_regions": chart_regions,
        "image_size": [w, h],
        "summary_hint": summary_hint,
    }
