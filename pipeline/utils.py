"""Shared helpers for the EnergyMap.AI pipeline modules."""

from __future__ import annotations

from typing import Iterable, Sequence

import numpy as np
import pandas as pd


def estimate_population(
    frame: pd.DataFrame,
    population_candidates: Iterable[str],
    scale: float,
) -> np.ndarray:
    """Estimate absolute population using normalized indicators.

    Args:
        frame: DataFrame containing the candidate columns.
        population_candidates: ordered list of column names to try.
        scale: multiplier applied to the normalized value (0-1 range).
    """
    for field in population_candidates:
        if field in frame.columns:
            values = pd.to_numeric(frame[field], errors="coerce").fillna(0.0)
            break
    else:
        values = pd.Series(0.0, index=frame.index)

    # If values appear to be percentages (0-100), bring them into 0-1 range.
    if values.max() > 1.0:
        values = values.clip(lower=0.0, upper=100.0) / 100.0

    values = values.clip(0.0, 1.0)
    return (values * float(scale)).to_numpy()
