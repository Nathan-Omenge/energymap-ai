# EnergyMap.AI

EnergyMap.AI maps underserved electricity clusters in Kenya by blending infrastructure accessibility and demand proxies into a unified Energy Need Score. The project delivers a geospatial scoring pipeline (Python + GeoPandas) and an interactive React/Leaflet dashboard for exploring high-priority communities together with electrification recommendations.

## Key Features
- **Composite scoring model** that normalizes and weights road coverage, transmission-line distance, and grid accessibility to produce a 0–100 Energy Need Score. (Population indices are stored for analysis but are not part of the current score.)
- **Automated data pipeline** powered by Jupyter notebooks (`notebooks/01_*`–`03_*`) for fetching, cleaning, clustering, and scoring geospatial datasets.
- **Interactive web map** built with React, Vite, and Leaflet to toggle between score and recommendation styling, highlight the top five highest-need clusters, and inspect per-cluster metadata.
- **Reproducible datasets** stored in `data_raw/` and `data_processed/`, including the served `clusters_scored_v2.geojson` file used by the frontend.

## Repository Layout
```text
data_raw/         # Unprocessed layers (Kenya boundary, transmission lines, roads)
data_processed/   # Derived artifacts: cleaned networks, clustered demand areas, scored outputs
frontend/         # React + Vite application that renders the interactive EnergyMap
notebooks/        # Jupyter notebooks implementing the data ingestion and scoring workflow
requirements.txt  # Python dependencies for running the geospatial pipeline
```

## Methodology Overview
1. **Data acquisition (`notebooks/01_data_fetch.ipynb`)**  
   Downloads boundary, grid, road, and ancillary demand datasets for Kenya.
2. **Pre-processing (`notebooks/02_preprocess_vectors.ipynb`)**  
   Cleans geometries, snaps networks, and aggregates raw features into settlement clusters.
3. **Energy need scoring (`notebooks/03_energy_need_score*.ipynb`)**  
   Normalizes indicators, applies weights, and computes the final Energy Need Score alongside an electrification recommendation:
   - *Main grid* for dense and accessible clusters close to existing infrastructure.
   - *Mini-grid* for medium-demand clusters with moderate access constraints.
   - *Off-grid* for remote or low-access clusters best served by stand-alone systems.

The frontend sidebar documents the scoring formula in terms of the normalized metrics currently in use.

## Getting Started

### 1. Python environment (data pipeline)
```bash
python -m venv venv_energymap
source venv_energymap/bin/activate
pip install -r requirements.txt
```

- Run the notebooks in order (`01_` → `03_` — the latest logic lives in `03_energy_need_score copy_v2.ipynb`) to refresh the processed datasets in `data_processed/`.
- Export the final `clusters_scored_v2.geojson` (or equivalent) into `frontend/public/data/` to update the map.
- The pipeline also writes summary tables such as `scores_v2.csv` for quick inspection.

### 2. Frontend (interactive map)
```bash
cd frontend
npm install
npm run dev
```

- The Vite dev server hosts the dashboard at the URL printed in the console (default: http://localhost:5173).
- Ensure the processed GeoJSON lives in `frontend/public/data/` so it is served at `/data/clusters_scored_v2.geojson`.

## Updating the Data
1. Re-run the scoring notebook after adjusting inputs or weights.
2. Confirm the resulting GeoJSON includes a `Score`, `cluster_id`, and a recommendation field (`recommendation` or `Recommendation` depending on the export).
3. Replace `frontend/public/data/clusters_scored_v2.geojson` with the new file and restart the Vite dev server.

## Tech Stack
- **Geospatial processing:** Python, GeoPandas, Rasterio, OSMnx, Shapely.
- **Visualization:** React 19, Leaflet 1.9, Vite.
- **Data formats:** GeoJSON (clusters, networks), CSV (scoring tables).

## Documentation

- **Release notes & architecture guide**: see `docs/README.md` for a detailed description of the upgraded pipeline, API, and front-end features, plus step-by-step setup instructions.

## License
Specify your chosen license in this section (e.g., MIT, Apache 2.0). Replace this line once a license has been selected.
