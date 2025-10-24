"""Priority scoring pipeline for EnergyMap.AI.

The implementation adapts the ElectroMap priority mapper so we can run the
scoring step as a reusable script. It reads configuration from
``energymap_config.json`` and writes enriched outputs for the frontend.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List

import geopandas as gpd
import numpy as np
import pandas as pd

from .utils import estimate_population

def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(value, maximum))


def normalize_to_ten(values: Iterable[float], invert: bool = False) -> np.ndarray:
    arr = np.asarray(values, dtype="float64")
    arr = np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0)

    if arr.size == 0:
        return np.array([], dtype="float64")

    vmax = arr.max()
    vmin = arr.min()
    if np.isclose(vmax, vmin):
        return np.full_like(arr, 5.0)

    normalized = (arr - vmin) / (vmax - vmin)
    if invert:
        normalized = 1 - normalized
    return np.clip(normalized * 10.0, 0.0, 10.0)


def resolve_field(data: pd.DataFrame, candidates: Iterable[str], default: float = 0.0) -> np.ndarray:
    for field in candidates:
        if field in data.columns:
            return pd.to_numeric(data[field], errors="coerce").fillna(default).to_numpy()
    return np.full(len(data), default, dtype="float64")


@dataclass
class Config:
    project_name: str
    scoring_input: Path
    scoring_output_geojson: Path
    scoring_output_csv: Path
    weights: Dict[str, float]
    thresholds: Dict[str, float]
    fallback_fields: Dict[str, List[str]]
    recommendation_rules: Dict[str, Dict[str, float]]
    population_scale: float

    @classmethod
    def from_file(cls, path: Path) -> "Config":
        with path.open("r", encoding="utf-8") as fh:
            raw = json.load(fh)

        project = raw.get("project", {})
        paths = raw.get("paths", {})
        scoring = raw.get("scoring", {})

        return cls(
            project_name=project.get("name", "EnergyMap"),
            scoring_input=Path(paths["scoring_input"]),
            scoring_output_geojson=Path(paths["scoring_output_geojson"]),
            scoring_output_csv=Path(paths["scoring_output_csv"]),
            weights=scoring.get("weights", {}),
            thresholds=scoring.get("thresholds", {}),
            fallback_fields=scoring.get("fallback_fields", {}),
            recommendation_rules=scoring.get("recommendation_rules", {}),
            population_scale=scoring.get("population_scale", 5000),
        )


class PriorityScoringPipeline:
    """Recomputes cluster priority metrics and persists enriched outputs."""

    def __init__(self, config_path: Path | str = "energymap_config.json"):
        self.config_path = Path(config_path)
        self.config = Config.from_file(self.config_path)

    def load_clusters(self) -> gpd.GeoDataFrame:
        input_path = self.config.scoring_input
        if not input_path.exists():
            raise FileNotFoundError(f"Scoring input not found: {input_path}")

        gdf = gpd.read_file(input_path)
        if "geometry" not in gdf.columns:
            raise ValueError("Input GeoJSON must contain geometries.")
        return gdf

    def compute_scores(self, gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
        fallback = self.config.fallback_fields

        population_index = resolve_field(gdf, fallback.get("population", []), default=0.0)
        access_gap_raw = resolve_field(gdf, fallback.get("access_gap", []), default=0.0)
        economic_raw = resolve_field(gdf, fallback.get("economic", []), default=0.0)
        social_raw = resolve_field(gdf, fallback.get("social", []), default=0.0)
        grid_distance = resolve_field(gdf, fallback.get("grid_distance", []), default=50.0)

        population_score = normalize_to_ten(population_index)
        access_gap_score = normalize_to_ten(access_gap_raw, invert=True)
        economic_score = normalize_to_ten(economic_raw)

        social_adjusted = np.where(social_raw > 0, social_raw, np.exp(-np.abs(population_index - 0.4)))
        social_need_score = normalize_to_ten(social_adjusted)

        grid_proximity_score = normalize_to_ten(grid_distance, invert=True)

        weights = self.config.weights
        composite = (
            weights.get("population", 0.0) * population_score
            + weights.get("access_gap", 0.0) * access_gap_score
            + weights.get("economic_activity", 0.0) * economic_score
            + weights.get("social_need", 0.0) * social_need_score
            + weights.get("grid_proximity", 0.0) * grid_proximity_score
        )

        thresholds = self.config.thresholds
        high = thresholds.get("high_priority", 7.0)
        medium = thresholds.get("medium_priority", 5.0)

        def categorize(value: float) -> str:
            if value >= high:
                return "High"
            if value >= medium:
                return "Medium"
            return "Low"

        recommendations = [
            self.recommend_solution(dist, pop_idx, econ)
            for dist, pop_idx, econ in zip(grid_distance, population_index, economic_score)
        ]

        estimated_population = estimate_population(
            gdf,
            self.config.fallback_fields.get("population", []),
            self.config.population_scale,
        )

        def estimate_cost(solution: str, population: float, distance: float) -> float:
            households = population * 0.3
            if solution == "grid_extension":
                return distance * 1000 + households * 200
            if solution.startswith("mini_grid"):
                capacity_kw = households * 0.5
                return capacity_kw * 1500 + households * 300
            return households * 500

        estimated_cost = np.array(
            [
                estimate_cost(sol, pop, dist)
                for sol, pop, dist in zip(recommendations, estimated_population, grid_distance)
            ]
        )

        enriched = gdf.copy()
        enriched["population_score"] = np.round(population_score, 2)
        enriched["access_gap_score"] = np.round(access_gap_score, 2)
        enriched["economic_score"] = np.round(economic_score, 2)
        enriched["social_need_score"] = np.round(social_need_score, 2)
        enriched["grid_proximity_score"] = np.round(grid_proximity_score, 2)
        enriched["priority_score"] = np.round(composite, 2)
        enriched["priority_category"] = [categorize(val) for val in composite]
        enriched["recommended_solution"] = recommendations
        enriched["estimated_population"] = np.round(estimated_population).astype(int)
        enriched["estimated_cost_usd"] = np.round(estimated_cost, 2)
        with np.errstate(divide="ignore", invalid="ignore"):
            cost_per_person = np.where(
                estimated_population > 0,
                estimated_cost / np.maximum(estimated_population, 1),
                0.0,
            )
        enriched["cost_per_person_usd"] = np.round(cost_per_person, 2)
        enriched["scoring_metadata"] = json.dumps(
            {
                "weights": weights,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "source": "pipeline/scoring.py",
            }
        )

        return enriched

    def recommend_solution(self, distance_km: float, population_index: float, economic_score: float) -> str:
        rules = self.config.recommendation_rules
        road_density_score = clamp(economic_score / 10.0, 0.0, 1.0)

        grid_rule = rules.get("grid_extension", {})
        if (
            distance_km <= grid_rule.get("max_distance_km", 5)
            and population_index >= grid_rule.get("min_population_index", 0.6)
        ):
            return "grid_extension"

        hybrid_rule = rules.get("mini_grid_hybrid", {})
        if (
            distance_km <= hybrid_rule.get("max_distance_km", 15)
            and population_index >= hybrid_rule.get("min_population_index", 0.3)
            and road_density_score >= hybrid_rule.get("min_road_density", 0.5)
        ):
            return "mini_grid_hybrid"

        standalone_rule = rules.get("standalone_solar", {})
        if (
            distance_km >= standalone_rule.get("min_distance_km", 25)
            and population_index <= standalone_rule.get("max_population_index", 0.2)
        ):
            return "standalone_solar"

        return "mini_grid_solar"

    def write_outputs(self, gdf: gpd.GeoDataFrame) -> None:
        geojson_path = self.config.scoring_output_geojson
        csv_path = self.config.scoring_output_csv

        geojson_path.parent.mkdir(parents=True, exist_ok=True)
        csv_path.parent.mkdir(parents=True, exist_ok=True)

        # Persist GeoJSON with decoded metadata
        enriched = gdf.copy()
        enriched["scoring_metadata"] = enriched["scoring_metadata"].apply(json.loads)
        enriched.to_file(geojson_path, driver="GeoJSON")

        summary_cols = [
            "cluster_id",
            "priority_score",
            "priority_category",
            "recommended_solution",
            "population_score",
            "access_gap_score",
            "economic_score",
            "social_need_score",
            "grid_proximity_score",
        ]
        available_cols = [col for col in summary_cols if col in enriched.columns]
        enriched[available_cols].to_csv(csv_path, index=False)

    def run(self) -> gpd.GeoDataFrame:
        clusters = self.load_clusters()
        enriched = self.compute_scores(clusters)
        self.write_outputs(enriched)
        return enriched


def main(config_path: str = "energymap_config.json") -> None:
    pipeline = PriorityScoringPipeline(config_path)
    enriched = pipeline.run()
    print(f"Enriched {len(enriched)} clusters → {pipeline.config.scoring_output_geojson}")


if __name__ == "__main__":
    main()
