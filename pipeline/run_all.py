"""Convenience entrypoint for running the entire analytical pipeline."""

from __future__ import annotations

from pathlib import Path

from .demand import DemandForecastPipeline
from .scenario import ScenarioPipeline
from .scoring import PriorityScoringPipeline


def main(config_path: str = "energymap_config.json") -> None:
    config = Path(config_path)
    PriorityScoringPipeline(config).run()
    DemandForecastPipeline(config).run()
    ScenarioPipeline(config).run()
    print("Pipeline complete.")


if __name__ == "__main__":
    main()
