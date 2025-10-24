"""Demand forecasting pipeline for EnergyMap.AI.

The goal is to provide baseline and forward-looking electricity demand metrics
using the enriched cluster GeoDataFrame produced by ``pipeline.scoring``.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict

import geopandas as gpd
import numpy as np
import pandas as pd

from .scoring import PriorityScoringPipeline


@dataclass
class DemandConfig:
    population_growth: Dict[str, float]
    baseline_consumption: float
    load_factor: float
    electrification_target_rate: float
    consumption_growth_rate: float
    population_scale: int = 5000

    @classmethod
    def from_config(cls, config: Dict) -> "DemandConfig":
        section = config.get("demand_forecasting", {})
        pop_growth = section.get("population_growth", {})
        return cls(
            population_growth=pop_growth,
            baseline_consumption=section.get("baseline_consumption_kwh_per_person", 500),
            load_factor=section.get("load_factor", 0.3),
            electrification_target_rate=section.get("electrification_target_rate", 0.8),
            consumption_growth_rate=section.get("consumption_growth_rate", 0.025),
            population_scale=section.get("population_scale", 5000),
        )


class DemandForecastPipeline:
    """Compute baseline and future demand metrics per cluster."""

    def __init__(self, config_path: Path | str = "energymap_config.json"):
        self.config_path = Path(config_path)
        with self.config_path.open("r", encoding="utf-8") as fh:
            self.config = json.load(fh)

        self.paths = self.config["paths"]
        self.demand_config = DemandConfig.from_config(self.config)

    def _load_enriched_clusters(self) -> gpd.GeoDataFrame:
        geojson_path = Path(self.paths["scoring_output_geojson"])
        if not geojson_path.exists():
            # Run scoring step if necessary
            PriorityScoringPipeline(self.config_path).run()
        return gpd.read_file(geojson_path)

    def _estimate_population(self, df: pd.DataFrame) -> np.ndarray:
        # Use normalized population indicators as proxies.
        pop_index = df.get("norm_pop")
        if pop_index is None:
            pop_index = df.get("pop_index")
        if pop_index is None:
            pop_index = df.get("population_score", 0) / 10
        pop_index = pd.to_numeric(pop_index, errors="coerce").fillna(0.0).clip(0, 1)
        return (pop_index * self.demand_config.population_scale).to_numpy()

    @staticmethod
    def _status_from_need(score: float) -> str:
        if score >= 60:
            return "none"
        if score >= 40:
            return "partial"
        return "electrified"

    def _baseline_demand(self, gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
        gdf = gdf.copy()
        gdf["estimated_population"] = self._estimate_population(gdf)

        need_score = pd.to_numeric(gdf.get("energy_need_score", 0), errors="coerce").fillna(0)
        gdf["electrification_status"] = [
            self._status_from_need(score) for score in need_score
        ]

        households = gdf["estimated_population"] * 0.3

        def household_demand(status: str, need: float) -> float:
            if status == "electrified":
                return 2000 - need * 5
            if status == "partial":
                return 800
            return 450

        gdf["demand_per_household_kwh"] = [
            household_demand(status, need) for status, need in zip(gdf["electrification_status"], need_score)
        ]

        gdf["baseline_demand_mwh_year"] = (households * gdf["demand_per_household_kwh"]) / 1000
        gdf["baseline_peak_demand_kw"] = (
            gdf["baseline_demand_mwh_year"] * 1000
        ) / (365 * 24 * max(self.demand_config.load_factor, 0.01))

        return gdf

    def _population_growth(self, density: float) -> float:
        growth = self.demand_config.population_growth
        urban_threshold = growth.get("urban_density_threshold", 100)
        peri_threshold = growth.get("peri_urban_density_threshold", 50)
        if density >= urban_threshold:
            return growth.get("urban_rate", 0.035)
        if density >= peri_threshold:
            return growth.get("peri_urban_rate", 0.025)
        return growth.get("rural_rate", 0.015)

    def _forecast_demand(self, gdf: gpd.GeoDataFrame, target_year: int = 2030) -> gpd.GeoDataFrame:
        base_year = 2024
        years = max(target_year - base_year, 0)

        growth_rates = [
            self._population_growth(density) for density in gdf.get("building_density", pd.Series(0, index=gdf.index))
        ]
        growth_rates = np.array(growth_rates)

        future_population = gdf["estimated_population"] * ((1 + growth_rates) ** years)
        gdf[f"population_{target_year}"] = future_population

        electrified = (gdf["electrification_status"] != "none").astype(float)
        target_rate = self.demand_config.electrification_target_rate
        adjustment = np.clip(target_rate - electrified.mean(), 0.0, 1.0)
        future_electrified = np.clip(electrified + adjustment, 0.0, 1.0)

        consumption_multiplier = (1 + self.demand_config.consumption_growth_rate) ** years
        base_demand_per_person = self.demand_config.baseline_consumption

        gdf[f"demand_{target_year}_mwh_year"] = (
            future_population * future_electrified * base_demand_per_person * consumption_multiplier
        ) / 1000

        gdf[f"peak_demand_{target_year}_kw"] = (
            gdf[f"demand_{target_year}_mwh_year"] * 1000
        ) / (365 * 24 * max(self.demand_config.load_factor, 0.01))

        return gdf

    def _write_outputs(self, gdf: gpd.GeoDataFrame) -> Dict[str, float]:
        demand_geojson = Path(self.paths["demand_output_geojson"])
        demand_csv = Path(self.paths["demand_output_csv"])
        summary_path = Path(self.paths["summary_stats_json"])

        demand_geojson.parent.mkdir(parents=True, exist_ok=True)
        demand_csv.parent.mkdir(parents=True, exist_ok=True)

        gdf.to_file(demand_geojson, driver="GeoJSON")

        selected = gdf[
            [
                "cluster_id",
                "priority_score",
                "priority_category",
                "recommended_solution",
                "estimated_population",
                "electrification_status",
                "baseline_demand_mwh_year",
                "baseline_peak_demand_kw",
                "demand_2030_mwh_year",
                "peak_demand_2030_kw",
            ]
        ].copy()
        selected.to_csv(demand_csv, index=False)

        totals = {
            "clusters": int(len(gdf)),
            "baseline_demand_mwh_year": float(gdf["baseline_demand_mwh_year"].sum()),
            "baseline_peak_kw": float(gdf["baseline_peak_demand_kw"].sum()),
            "demand_2030_mwh_year": float(gdf["demand_2030_mwh_year"].sum()),
            "peak_2030_kw": float(gdf["peak_demand_2030_kw"].sum()),
        }

        summary_path.write_text(json.dumps(totals, indent=2))
        return totals

    def run(self) -> Dict[str, float]:
        gdf = self._load_enriched_clusters()
        gdf = self._baseline_demand(gdf)
        gdf = self._forecast_demand(gdf, target_year=2030)
        return self._write_outputs(gdf)


def main(config_path: str = "energymap_config.json") -> None:
    pipeline = DemandForecastPipeline(config_path)
    totals = pipeline.run()
    print("Demand forecasting complete:", totals)


if __name__ == "__main__":
    main()
