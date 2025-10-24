# EnergyMap.AI – Decision Support Release Notes

This release elevates the original priority-mapping prototype into a multi-feature decision support platform for energy-sector stakeholders. The repo now delivers an end-to-end workflow—from data synthesis, to API delivery, to a three-module React experience—that can be cloned, reproduced, and extended.

---

## 1. What Changed From The First Iteration?

| Theme | Previous state | Current state |
| ----- | -------------- | ------------- |
| **Use case coverage** | Single-view map of Energy Need Scores. | Three dedicated features: priority map, demand forecaster, scenario simulator. |
| **Data pipeline** | Manual notebook execution for scoring. | Modular Python package (`pipeline/`) with scoring, demand, and scenario orchestration (`python -m pipeline.run_all`). |
| **Back-end delivery** | Static files served directly to the map. | FastAPI service exposing `/clusters`, `/forecasts`, `/summary`, `/scenarios`, with async recompute (`/clusters/recalculate`). |
| **Front-end UX** | One-page Leaflet map. | Router-driven React app (Vite) with feature-specific dashboards, charts, scenario sliders, downloadable outputs. |
| **Operational reproducibility** | Ad-hoc instructions. | Environment-aware configuration (`energymap_config.json`), documented workflows, deterministic outputs in `frontend/public/data/`. |

---

## 2. System Architecture Overview

```
┌────────────────┐      ┌───────────────────────────┐      ┌────────────────────────────┐
│  Data Sources   │ ⇒   │  pipeline/ (Python)        │ ⇒   │  frontend/public/data/      │
│  (GeoJSON, CSV) │      │  scoring.py  – cluster     │      │  clusters_enriched.geojson  │
└────────────────┘      │  demand.py   – baselines   │      │  demand_forecasts.geojson   │
                        │  scenario.py – interventions│     │  scenarios/*.geojson        │
                        │  run_all.py – orchestrator  │     └────────────────────────────┘
                                      │                                    │
                                      ▼                                    ▼
                         ┌───────────────────────────┐      ┌────────────────────────────┐
                         │ FastAPI backend           │      │ React front-end (Vite)    │
                         │ /clusters /forecasts ...  │      │ / (map) /demand /scenarios│
                         └───────────────────────────┘      └────────────────────────────┘
```

**Key configuration**: `energymap_config.json` centralises paths, weights, population scaling, demand-growth parameters, and scenario defaults. Updating this file propagates through the entire pipeline and API.

---

## 3. Feature Deep-Dive

### 3.1 Priority Mapping

* **Scoring pipeline** (`pipeline/scoring.py`):
  * Normalises population, access, economic, social, and grid-proximity indicators.
  * Applies configurable weights and thresholds to compute `priority_score`, categories (High/Medium/Low), cost, and recommended electrification pathway.
  * Produces enriched GeoJSON + CSV for the frontend and API consumption.
* **Frontend view** (`frontend/src/pages/PriorityMapPage.jsx`):
  * Leaflet heatmap with mode toggle (score vs recommendation).
  * Sidebar summarises top clusters, system snapshot, and quick scenario highlights.

### 3.2 Demand Forecasting

* **Forecast logic** (`pipeline/demand.py`):
  * Derives baseline load from estimated population, demand per household, and load factor.
  * Projects 2030 population and demand using density-aware growth rates and electrification targets.
  * Writes `demand_forecasts.geojson` and `summary_metrics.json`.
* **Frontend view** (`frontend/src/pages/DemandForecastPage.jsx`):
  * Demand vs 2030 cards, priority-wise bar chart, top demand centres table.
  * Responds instantly to regenerated data (no client-side simulation).

### 3.3 Scenario Simulator

* **Back-end** (`pipeline/scenario.py`):
  * Runs predefined scenarios (grid extension, mini-grid deployment, population growth).
  * Outputs aggregated metrics (`scenario_comparison.csv`) and GeoJSON files for each scenario.
* **Front-end** (`frontend/src/pages/ScenarioSimulatorPage.jsx`):
  * Displays precomputed scenario impacts (people electrified, demand delta, cost, electrification rate).
  * Includes “Build Your Own Scenario” slider panel that recomputes impacts client-side using the demand dataset (grid vs mini-grid counts, growth assumptions, cost curves).

---

## 4. Developer Workflow

### 4.1 Environment Setup

```bash
# Python geospatial stack (root)
python -m venv venv_energymap
source venv_energymap/bin/activate
pip install -r requirements.txt

# Frontend (React + Vite)
cd frontend
npm install
pip install -r backend/requirements.txt   # inside activated venv
```

### 4.2 Regenerating Analysis Outputs

```bash
source venv_energymap/bin/activate
python -m pipeline.run_all
```

This command executes scoring, demand forecasting, and scenario simulation in sequence. All artefacts are stored under `frontend/public/data/`, making the solution portable and versionable.

### 4.3 Running the Platform Locally

```bash
# Terminal 1 – FastAPI backend (after run_all)
cd frontend
source ../venv_energymap/bin/activate
uvicorn backend.app.main:app --reload

# Terminal 2 – React frontend
cd frontend
VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev
```

Visit `http://localhost:5173` for the map, `http://localhost:5173/demand` for forecasting, and `http://localhost:5173/scenarios` for simulations.

### 4.4 Recomputing on Demand

The backend exposes a utility endpoint:

```bash
curl -X POST http://127.0.0.1:8000/clusters/recalculate
```

This asynchronously runs `python -m pipeline.run_all` and updates all downstream files. Progress/status can be checked via `/status`, and the new data becomes available at `/clusters`, `/forecasts`, `/summary`, and `/scenarios`.

---

## 5. Implementation Highlights & Extensibility

* **Config-driven weights**: Tuning scoring weights, population scaling, or growth rates in `energymap_config.json` automatically propagates through the Python and front-end layers.
* **Scenario downloads**: `/scenarios` now returns both aggregate metrics and the GeoJSON paths for each scenario, enabling future “Download” buttons or GIS integration.
* **CORS-enabled API**: FastAPI middleware allows development from the Vite host while remaining locked down to explicit origins in production.
* **Client-side simulations**: The React simulator mirrors the Python scenario heuristics to deliver instantaneous what-if analysis without blocking the backend.
* **Domain-first UX**: Each page contextualises metrics (baseline vs projection, cost per person, electrification rate) to help planners reason about electrification pathways.

---

## 6. Next Steps

* **Advanced scenario tuning**: Extend the sliders or backend interventions (e.g., hybrid costs, renewable penetration, CAPEX vs OPEX).
* **Data provenance**: Integrate notebook export steps or metadata in `scoring_metadata` so the front-end can cite data sources.
* **Automated tests**: Add smoke tests that execute `pipeline.run_all` and verify API responses—ideal for CI when pushing to GitHub.
* **Deployment playbook**: Containerise backend + pipeline, host static front-end assets (e.g., S3/CloudFront), and document environment variables for production.

---

Clone the repository, follow the setup instructions, and you’ll reproduce the full decision support workflow in minutes. The new structure keeps geospatial experts, data scientists, and engineers aligned on a shared, extensible codebase.
