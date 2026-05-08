# Dashboard Analyzer (Python service)

External OCR + computer-vision microservice for the AI Voice Commentary
Dashboard. Extracts text, KPIs, numbers, percentages, currency, dates,
dominant colors and chart regions from a dashboard screenshot, then returns
structured JSON. The Lovable app feeds that JSON to Gemini as ground truth
for higher-accuracy commentary.

## Why a separate service?

Lovable's runtime is a Cloudflare Worker — it cannot run Python, OpenCV, or
EasyOCR. Host this microservice anywhere that runs Docker (Render, Railway,
Fly.io, Google Cloud Run, a VM, etc.) and point the app at it.

## Quick start (local)

```bash
cd python-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export AUTH_TOKEN=choose-a-long-random-string
uvicorn main:app --host 0.0.0.0 --port 8000
```

Test:

```bash
curl -X POST http://localhost:8000/analyze \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"image_base64\":\"$(base64 -w0 sample.png)\"}"
```

## Docker

```bash
docker build -t dashboard-analyzer .
docker run -p 8000:8000 -e AUTH_TOKEN=$AUTH_TOKEN dashboard-analyzer
```

## Deploy to Render

1. Push this folder to a GitHub repo.
2. New → Web Service → connect repo → Runtime: Docker.
3. Add env var `AUTH_TOKEN` (use the same value you set as
   `PYTHON_ANALYSIS_TOKEN` in Lovable).
4. After deploy, copy the public URL (e.g. `https://my-app.onrender.com`)
   and set it as `PYTHON_ANALYSIS_URL` in Lovable, **with `/analyze` appended**:
   `https://my-app.onrender.com/analyze`.

## Endpoint

`POST /analyze` — see top of `main.py` for the full request/response shape.

`GET /health` — liveness check.

## Notes

- First request downloads the EasyOCR model (~64 MB) into the container —
  cold start can take 30–60 s. Subsequent requests are fast.
- For higher throughput, increase the instance size or run multiple workers
  (`uvicorn main:app --workers 2`).
