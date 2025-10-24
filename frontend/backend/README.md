# Backend Service (FastAPI)

This directory hosts the FastAPI service that exposes enriched cluster data and lets you trigger recomputation jobs from the React front end.

## Quick start

```bash
cd /Users/nathanomenge/Desktop/energymap-ai/frontend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload
```

The API will be available at `http://127.0.0.1:8000`.

## Available endpoints

- `GET /health` – basic status check.
- `GET /clusters` – returns the latest `clusters_enriched.geojson` plus metadata.
- `POST /clusters/recalculate` – triggers the Node scoring script (`npm run score`) in the background. Custom weights are not yet supported.
- `GET /status` – reports the status of the most recent recompute job.

## Workflow

1. Ensure the enrichment script has produced `public/data/clusters_enriched.geojson` (run `npm run score` if needed).
2. Start the FastAPI server as shown above.
3. Point the React app to `http://127.0.0.1:8000/clusters` instead of `/data/...` once the API is running.
4. Use `POST /clusters/recalculate` (e.g., via cURL or the interactive docs at `/docs`) whenever you need to refresh scores. The job executes asynchronously; check `GET /status` or reload `GET /clusters` to see the updated timestamp.

This sets the stage for adding forecast and scenario endpoints later-on, following the same pattern.

