"""Scenario simulation pipeline for EnergyMap.AI.

The module mirrors ElectroMap's scenario simulator with simplified heuristics
suited to the currently available dataset. It works off the demand forecasting
outputs and produces comparison tables plus per-scenario GeoJSON files.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List

import geopandas as gpd
import numpy as np

from .demand import DemandForecastPipeline


@dataclass
class ScenarioDefinition:
    name: str
    description: str
    interventions: List[Dict]


class ScenarioPipeline:
    def __init__(self, config_path: Path | str = "energymap_config.json"):
        self.config_path = Path(config_path)
        with self.config_path.open("r", encoding="utf-8") as fh:
            self.config = json.load(fh)

        self.paths = self.config["paths"]

        # Ensure prerequisites exist
        DemandForecastPipeline(self.config_path).run()

        self.demand_geojson = Path(self.paths["demand_output_geojson"])
        self.output_dir = Path(self.paths["scenario_output_dir"])
        self.comparison_csv = Path(self.paths["scenario_comparison_csv"])

    def load_baseline(self) -> gpd.GeoDataFrame:
        return gpd.read_file(self.demand_geojson)

    def default_scenarios(self) -> List[ScenarioDefinition]:
        defaults = self.config.get("scenarios", {}).get("default_scenarios", [])
        scenarios = []
        for item in defaults:
            scenarios.append(
                ScenarioDefinition(
                    name=item.get("name", "Unnamed Scenario"),
                    description=item.get("description", ""),
                    interventions=item.get("interventions", []),
                )
            )
        return scenarios

    def apply_intervention(self, data: gpd.GeoDataFrame, intervention: Dict) -> gpd.GeoDataFrame:
        itype = intervention.get("type")
        result = data.copy()

        if itype == "grid_extension":
            count = intervention.get("count", 10)
            target = intervention.get("target", "top_priority")
            if target == "top_priority":
                targets = result.nlargest(count, "priority_score")
            elif target == "nearest_grid":
                targets = result.nsmallest(count, "dist_to_power_km")
            else:
                targets = result.head(count)

            idx = targets.index
            result.loc[idx, "electrification_status"] = "electrified"
            result.loc[idx, "recommended_solution"] = "grid_extension"
            result.loc[idx, "baseline_demand_mwh_year"] *= 1.5
            result.loc[idx, "scenario_tag"] = "grid_extension"

        elif itype == "mini_grid_deployment":
            count = intervention.get("count", 20)
            suitable = result[
                (result["recommended_solution"].str.contains("mini", na=False))
                | (result["electrification_status"] == "none")
            ]
            targets = suitable.nlargest(count, "priority_score")
            idx = targets.index
            result.loc[idx, "electrification_status"] = "partial"
            result.loc[idx, "recommended_solution"] = "mini_grid"
            result.loc[idx, "baseline_demand_mwh_year"] *= 1.3
            result.loc[idx, "scenario_tag"] = "mini_grid"

        elif itype == "population_growth":
            rate = intervention.get("rate", 0.1)
            result["estimated_population"] *= 1 + rate
            result["baseline_demand_mwh_year"] *= 1 + rate
            result["baseline_peak_demand_kw"] *= 1 + rate
            result["scenario_tag"] = "population_growth"

        elif itype == "demand_increase":
            rate = intervention.get("rate", 0.2)
            result["baseline_demand_mwh_year"] *= 1 + rate
            result["baseline_peak_demand_kw"] *= 1 + rate
            result["scenario_tag"] = "demand_increase"

        elif itype == "solar_capacity_addition":
            capacity = intervention.get("capacity_mw", 50)
            per_cluster = capacity / max(len(result), 1)
            result["solar_capacity_mw"] = result.get("solar_capacity_mw", 0) + per_cluster
            result["scenario_tag"] = "solar_capacity"

        return result

    def calculate_impacts(self, baseline: gpd.GeoDataFrame, scenario: gpd.GeoDataFrame) -> Dict[str, float]:
        baseline_unelectrified = baseline[baseline["electrification_status"] == "none"]
        scenario_unelectrified = scenario[scenario["electrification_status"] == "none"]

        people_electrified = (
            baseline_unelectrified["estimated_population"].sum()
            - scenario_unelectrified["estimated_population"].sum()
        )
        settlements_connected = len(baseline_unelectrified) - len(scenario_unelectrified)

        demand_baseline = baseline["baseline_demand_mwh_year"].sum()
        demand_scenario = scenario["baseline_demand_mwh_year"].sum()

        cost_field = scenario.get("estimated_cost_usd")
        if cost_field is None:
            cost_total = float("nan")
        else:
            cost_total = float(cost_field.sum())

        return {
            "people_electrified": float(max(people_electrified, 0)),
            "settlements_connected": float(max(settlements_connected, 0)),
            "demand_increase_mwh": float(demand_scenario - demand_baseline),
            "cost_usd": cost_total,
            "electrification_rate": float(
                len(scenario[scenario["electrification_status"] != "none"]) / len(scenario)
            ),
        }

    def run(self) -> List[Dict[str, float]]:
        baseline = self.load_baseline()
        scenarios = []

        self.output_dir.mkdir(parents=True, exist_ok=True)

        for definition in self.default_scenarios():
            scenario_data = baseline.copy()
            for intervention in definition.interventions:
                scenario_data = self.apply_intervention(scenario_data, intervention)

            impacts = self.calculate_impacts(baseline, scenario_data)
            impacts["scenario_name"] = definition.name
            impacts["description"] = definition.description
            impacts["generated_at"] = datetime.utcnow().isoformat()

            scenarios.append(impacts)

            geojson_path = self.output_dir / f"{definition.name.replace(' ', '_').lower()}.geojson"
            scenario_data.to_file(geojson_path, driver="GeoJSON")

        if scenarios:
            import pandas as pd

            df = pd.DataFrame(scenarios)
            self.comparison_csv.parent.mkdir(parents=True, exist_ok=True)
            df.to_csv(self.comparison_csv, index=False)

        return scenarios


def main(config_path: str = "energymap_config.json") -> None:
    pipeline = ScenarioPipeline(config_path)
    results = pipeline.run()
    print(f"Generated {len(results)} scenarios → {pipeline.comparison_csv}")


if __name__ == "__main__":
    main()
