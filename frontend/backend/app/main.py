from __future__ import annotations

import csv
import json
import subprocess
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

app = FastAPI(
    title="EnergyMap Backend",
    description=(
        "API for serving enriched cluster data and triggering recomputation jobs. "
        "Designed to mirror the FastAPI setup discussed during integration planning."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_PATH = REPO_ROOT / "frontend" / "public" / "data"
ENRICHED_GEOJSON = DATA_PATH / "clusters_enriched.geojson"
SUMMARY_CSV = DATA_PATH / "clusters_enriched_summary.csv"
DEMAND_GEOJSON = DATA_PATH / "demand_forecasts.geojson"
DEMAND_CSV = DATA_PATH / "demand_forecasts.csv"
SUMMARY_JSON = DATA_PATH / "summary_metrics.json"
SCENARIO_DIR = DATA_PATH / "scenarios"
SCENARIO_COMPARISON = SCENARIO_DIR / "scenario_comparison.csv"
SCORE_SCRIPT = ["python", "-m", "pipeline.run_all"]

lock = threading.Lock()


class RecalculateRequest(BaseModel):
    weights: Optional[Dict[str, float]] = Field(
        default=None,
        description=(
            "Optional custom weights for population/access/economic scores. "
            "Currently informational; the local scoring script uses built-in weights."
        ),
    )
    dry_run: bool = Field(
        default=False,
        description="If true, validates the request without running the recompute job.",
    )


class JobStatus(BaseModel):
    last_run: Optional[datetime] = None
    last_status: Optional[str] = None
    last_error: Optional[str] = None


status = JobStatus()


def run_scoring_job() -> None:
    global status
    started = datetime.now(timezone.utc)

    try:
        result = subprocess.run(
            SCORE_SCRIPT,
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as exc:
        with lock:
            status = JobStatus(
                last_run=started,
                last_status="failed",
                last_error=exc.stderr.strip() or str(exc),
            )
        return

    with lock:
        status = JobStatus(
            last_run=started,
            last_status="completed",
            last_error=result.stderr.strip() or None,
        )


@app.get("/health")
def healthcheck() -> Dict[str, str]:
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/clusters")
def get_clusters() -> JSONResponse:
    data = _read_geojson(ENRICHED_GEOJSON)

    response_meta = {
        "generated_at": status.last_run.isoformat() if status.last_run else None,
        "summary_csv": str(SUMMARY_CSV.relative_to(REPO_ROOT)) if SUMMARY_CSV.exists() else None,
        "record_count": len(data.get("features", [])),
    }
    return JSONResponse({"meta": response_meta, "data": data})


@app.post("/clusters/recalculate")
def recalculate_clusters(
    payload: RecalculateRequest,
    background_tasks: BackgroundTasks,
) -> Dict[str, str]:
    if payload.weights:
        raise HTTPException(
            status_code=400,
            detail="Custom weights are not yet supported in the current scoring pipeline.",
        )

    if payload.dry_run:
        return {"status": "ok", "message": "Dry run successful; no job executed."}

    background_tasks.add_task(run_scoring_job)

    return {
        "status": "accepted",
        "message": "Recalculation job submitted. Check /clusters or /status for updates.",
    }


@app.get("/status")
def get_status() -> JobStatus:
    return status


def _read_geojson(path: Path) -> Dict:
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Invalid GeoJSON at {path}: {exc}") from exc


@app.get("/forecasts")
def get_forecasts() -> JSONResponse:
    data = _read_geojson(DEMAND_GEOJSON)
    meta = {
        "record_count": len(data.get("features", [])),
        "csv": str(DEMAND_CSV.relative_to(REPO_ROOT)) if DEMAND_CSV.exists() else None,
    }
    return JSONResponse({"meta": meta, "data": data})


@app.get("/scenarios")
def get_scenarios() -> Dict[str, List[Dict[str, str]]]:
    if not SCENARIO_COMPARISON.exists():
        raise HTTPException(status_code=404, detail="Scenario comparison not generated yet.")

    entries: List[Dict[str, str]] = []
    with SCENARIO_COMPARISON.open("r", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            entries.append(row)

    files: List[Dict[str, str]] = []
    if SCENARIO_DIR.exists():
        for geojson in SCENARIO_DIR.glob("*.geojson"):
            files.append(
                {
                    "name": geojson.stem.replace("_", " "),
                    "path": str(geojson.relative_to(REPO_ROOT)),
                }
            )

    return {"comparison": entries, "files": files}


@app.get("/summary")
def get_summary() -> Dict[str, Optional[float]]:
    if SUMMARY_JSON.exists():
        try:
            metrics = json.loads(SUMMARY_JSON.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=500, detail=f"Invalid summary JSON: {exc}") from exc
    else:
        metrics = {}

    metrics.update(
        {
            "last_run": status.last_run.isoformat() if status.last_run else None,
            "last_status": status.last_status,
            "last_error": status.last_error,
        }
    )
    return metrics
