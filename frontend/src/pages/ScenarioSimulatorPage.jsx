import { useEffect, useMemo, useState } from "react";

const costForSolution = (solution, population, distanceKm) => {
  const households = population * 0.3;
  if (solution === "grid_extension") {
    return distanceKm * 1000 + households * 200;
  }
  if (solution.startsWith("mini_grid")) {
    const capacityKw = households * 0.5;
    return capacityKw * 1500 + households * 300;
  }
  return households * 500;
};

const ScenarioSimulatorPage = () => {
  const apiBase = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
  const [comparison, setComparison] = useState([]);
  const [forecasts, setForecasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customParams, setCustomParams] = useState({
    gridCount: 15,
    miniGridCount: 20,
    populationGrowth: 10,
    demandIncrease: 20,
  });

  useEffect(() => {
    const controller = new AbortController();

    const loadScenarios = async () => {
      try {
        const res = await fetch(`${apiBase}/scenarios`, { signal: controller.signal });
        if (!res.ok) throw new Error(`Scenarios API error ${res.status}`);
        const payload = await res.json();
        const rows = (payload?.comparison || []).map((entry) => ({
          name: entry.scenario_name,
          people: Number(entry.people_electrified || 0),
          demand: Number(entry.demand_increase_mwh || 0),
          cost: Number(entry.cost_usd || 0),
          rate: Number(entry.electrification_rate || 0),
        }));
        setComparison(rows);
      } catch (err) {
        if (err.name === "AbortError") return;
        console.warn("Scenario comparison unavailable", err);
      }
    };

    const loadForecasts = async () => {
      try {
        const res = await fetch(`${apiBase}/forecasts`, { signal: controller.signal });
        if (!res.ok) throw new Error(`Forecast API error ${res.status}`);
        const payload = await res.json();
        setForecasts(payload?.data?.features || []);
      } catch (err) {
        if (err.name === "AbortError") return;
        console.warn("Forecast data unavailable", err);
      } finally {
        setLoading(false);
      }
    };

    loadScenarios();
    loadForecasts();

    return () => controller.abort();
  }, [apiBase]);

  const baselineStats = useMemo(() => {
    if (!forecasts.length) return null;
    let populationTotal = 0;
    let unelectrified = 0;
    let baselineDemand = 0;
    const data = forecasts.map((feature) => {
      const props = feature.properties || {};
      populationTotal += props.estimated_population || 0;
      if ((props.electrification_status || "none") === "none") {
        unelectrified += props.estimated_population || 0;
      }
      baselineDemand += props.baseline_demand_mwh_year || 0;
      return {
        id: props.cluster_id,
        priority: props.priority_score || 0,
        distance: props.dist_to_power_km || 50,
        population: props.estimated_population || 0,
        status: props.electrification_status || "none",
        recommended: props.recommended_solution || "mini_grid",
        baselineDemand: props.baseline_demand_mwh_year || 0,
        cost: props.estimated_cost_usd || 0,
      };
    });

    return {
      data,
      populationTotal,
      unelectrified,
      baselineDemand,
    };
  }, [forecasts]);

  const customImpact = useMemo(() => {
    if (!baselineStats) return null;

    const gridCount = customParams.gridCount;
    const miniCount = customParams.miniGridCount;
    const popGrowthRate = customParams.populationGrowth / 100;
    const demandIncreaseRate = customParams.demandIncrease / 100;

    const scenario = baselineStats.data.map((item) => ({ ...item }));
    const baselineDemand = baselineStats.baselineDemand;

    const gridTargets = scenario
      .filter((item) => item.status !== "electrified")
      .sort((a, b) => b.priority - a.priority)
      .slice(0, gridCount);

    gridTargets.forEach((item) => {
      item.status = "electrified";
      item.scenarioTag = "grid_extension";
      item.scenarioCost = costForSolution("grid_extension", item.population, item.distance);
      item.baselineDemand *= 1.5;
    });

    const miniTargets = scenario
      .filter((item) => item.status === "none")
      .sort((a, b) => b.population - a.population)
      .slice(0, miniCount);

    miniTargets.forEach((item) => {
      item.status = "partial";
      item.scenarioTag = "mini_grid";
      item.scenarioCost = costForSolution("mini_grid", item.population, item.distance);
      item.baselineDemand *= 1.3;
    });

    scenario.forEach((item) => {
      item.population *= 1 + popGrowthRate;
      item.baselineDemand *= 1 + demandIncreaseRate;
    });

    const scenarioUnelectrified = scenario
      .filter((item) => item.status === "none")
      .reduce((acc, item) => acc + item.population, 0);

    const demandScenario = scenario.reduce((acc, item) => acc + item.baselineDemand, 0);
    const peopleElectrified = Math.max(
      0,
      baselineStats.unelectrified - scenarioUnelectrified
    );

    const totalCost = scenario.reduce((acc, item) => acc + (item.scenarioCost || 0), 0);
    const costPerPerson = peopleElectrified > 0 ? totalCost / peopleElectrified : 0;
    const electrificationRate =
      baselineStats.populationTotal > 0
        ? (baselineStats.populationTotal - scenarioUnelectrified) /
          baselineStats.populationTotal
        : 0;

    return {
      peopleElectrified,
      demandIncrease: demandScenario - baselineDemand,
      totalCost,
      costPerPerson,
      electrificationRate,
    };
  }, [baselineStats, customParams]);

  const updateParam = (key) => (event) => {
    const value = Number(event.target.value);
    setCustomParams((prev) => ({ ...prev, [key]: value }));
  };

  const formatNumber = (value, decimals = 1) =>
    typeof value === "number"
      ? value.toLocaleString("en-US", { maximumFractionDigits: decimals })
      : "-";

  return (
    <div className="page-container">
      <header className="page-header">
        <h1>Scenario Simulator</h1>
        <p>
          Compare predefined electrification strategies or configure your own
          mix of interventions to assess people served, demand growth, and
          investment requirements.
        </p>
      </header>

      <section className="card">
        <h3>Predefined Scenarios</h3>
        {loading && <p className="muted">Loading scenarios…</p>}
        {!loading && !comparison.length && (
          <p className="muted">No scenario data available.</p>
        )}
        {comparison.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>People Electrified</th>
                <th>Demand Δ (MWh)</th>
                <th>Total Cost (USD)</th>
                <th>Electrification Rate</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{formatNumber(row.people, 0)}</td>
                  <td>{formatNumber(row.demand, 1)}</td>
                  <td>${formatNumber(row.cost, 0)}</td>
                  <td>{formatNumber(row.rate * 100, 1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h3>Build Your Own Scenario</h3>
        {!baselineStats && <p className="muted">Forecast data unavailable.</p>}
        {baselineStats && (
          <div className="two-column">
            <div className="controls">
              <label>
                Grid extensions
                <input
                  type="range"
                  min="0"
                  max="40"
                  value={customParams.gridCount}
                  onChange={updateParam("gridCount")}
                />
                <span>{customParams.gridCount} clusters</span>
              </label>

              <label>
                Mini-grid deployments
                <input
                  type="range"
                  min="0"
                  max="50"
                  value={customParams.miniGridCount}
                  onChange={updateParam("miniGridCount")}
                />
                <span>{customParams.miniGridCount} clusters</span>
              </label>

              <label>
                Population growth impact
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={customParams.populationGrowth}
                  onChange={updateParam("populationGrowth")}
                />
                <span>{customParams.populationGrowth}%</span>
              </label>

              <label>
                Demand growth from economic activity
                <input
                  type="range"
                  min="0"
                  max="40"
                  value={customParams.demandIncrease}
                  onChange={updateParam("demandIncrease")}
                />
                <span>{customParams.demandIncrease}%</span>
              </label>
            </div>

            <div className="results">
              <div className="metric-block">
                <span className="metric-label">People Electrified</span>
                <span className="metric-value accent">
                  {formatNumber(customImpact?.peopleElectrified || 0, 0)}
                </span>
              </div>
              <div className="metric-block">
                <span className="metric-label">Demand Increase</span>
                <span className="metric-value">
                  {formatNumber(customImpact?.demandIncrease || 0, 1)} MWh
                </span>
              </div>
              <div className="metric-block">
                <span className="metric-label">Total Cost</span>
                <span className="metric-value">
                  ${formatNumber(customImpact?.totalCost || 0, 0)}
                </span>
              </div>
              <div className="metric-block">
                <span className="metric-label">Cost per Person</span>
                <span className="metric-value">
                  ${formatNumber(customImpact?.costPerPerson || 0, 0)}
                </span>
              </div>
              <div className="metric-block">
                <span className="metric-label">Electrification Rate</span>
                <span className="metric-value">
                  {formatNumber((customImpact?.electrificationRate || 0) * 100, 1)}%
                </span>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default ScenarioSimulatorPage;
