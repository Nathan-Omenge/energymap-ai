import { useEffect, useMemo, useState } from "react";

const DemandForecastPage = () => {
  const [summary, setSummary] = useState(null);
  const [byPriority, setByPriority] = useState([]);
  const [topConsumers, setTopConsumers] = useState([]);
  const [loading, setLoading] = useState(true);
  const apiBase = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

  useEffect(() => {
    const controller = new AbortController();

    const loadSummary = async () => {
      try {
        const res = await fetch(`${apiBase}/summary`, { signal: controller.signal });
        if (!res.ok) throw new Error(`Summary API error ${res.status}`);
        const payload = await res.json();
        setSummary(payload);
      } catch (err) {
        if (err.name === "AbortError") return;
        console.warn("Summary API unavailable", err);
      }
    };

    const loadForecasts = async () => {
      try {
        const res = await fetch(`${apiBase}/forecasts`, { signal: controller.signal });
        if (!res.ok) throw new Error(`Forecast API error ${res.status}`);
        const payload = await res.json();
        const features = payload?.data?.features || [];

        const aggregation = new Map();
        features.forEach((feature) => {
          const props = feature.properties || {};
          const key = props.priority_category || "Unclassified";
          if (!aggregation.has(key)) {
            aggregation.set(key, {
              label: key,
              baseline: 0,
              future: 0,
              population: 0,
            });
          }
          const bucket = aggregation.get(key);
          bucket.baseline += props.baseline_demand_mwh_year || 0;
          bucket.future += props.demand_2030_mwh_year || 0;
          bucket.population += props.estimated_population || 0;
        });

        const priorityArray = Array.from(aggregation.values()).sort((a, b) => {
          const order = { High: 0, Medium: 1, Low: 2 };
          return (order[a.label] ?? 99) - (order[b.label] ?? 99);
        });

        const top = [...features]
          .sort(
            (a, b) =>
              (b.properties?.demand_2030_mwh_year || 0) -
              (a.properties?.demand_2030_mwh_year || 0)
          )
          .slice(0, 8)
          .map((item) => ({
            id: item.properties?.cluster_id,
            baseline: item.properties?.baseline_demand_mwh_year || 0,
            future: item.properties?.demand_2030_mwh_year || 0,
            solution: item.properties?.recommended_solution || "",
          }));

        setByPriority(priorityArray);
        setTopConsumers(top);
      } catch (err) {
        if (err.name === "AbortError") return;
        console.warn("Forecast API unavailable", err);
      } finally {
        setLoading(false);
      }
    };

    loadSummary();
    loadForecasts();

    return () => controller.abort();
  }, [apiBase]);

  const maxValue = useMemo(() => {
    const values = byPriority.flatMap((item) => [item.baseline, item.future]);
    return values.length ? Math.max(...values) : 0;
  }, [byPriority]);

  const formatNumber = (value, decimals = 1) =>
    typeof value === "number"
      ? value.toLocaleString("en-US", { maximumFractionDigits: decimals })
      : "-";

  return (
    <div className="page-container">
      <header className="page-header">
        <h1>Demand Forecasting</h1>
        <p>
          Demand projections combine baseline consumption with population growth,
          electrification targets, and economic development assumptions drawn from
          the pipeline configuration.
        </p>
      </header>

      <section className="card-grid">
        <article className="card">
          <h3>Total Demand</h3>
          <div className="metric-pair">
            <div>
              <span className="metric-label">Baseline</span>
              <span className="metric-value">
                {formatNumber(summary?.baseline_demand_mwh_year, 1)} MWh/year
              </span>
            </div>
            <div>
              <span className="metric-label">2030 Forecast</span>
              <span className="metric-value accent">
                {formatNumber(summary?.demand_2030_mwh_year, 1)} MWh/year
              </span>
            </div>
          </div>
          <div className="trend-bar">
            <div className="trend-baseline" />
            <div className="trend-future" />
          </div>
        </article>

        <article className="card">
          <h3>Peak Load</h3>
          <div className="metric-pair">
            <div>
              <span className="metric-label">Current</span>
              <span className="metric-value">
                {formatNumber(summary?.baseline_peak_kw, 0)} kW
              </span>
            </div>
            <div>
              <span className="metric-label">2030 Peak</span>
              <span className="metric-value accent">
                {formatNumber(summary?.peak_2030_kw, 0)} kW
              </span>
            </div>
          </div>
        </article>
      </section>

      <section className="card">
        <h3>Demand by Priority Category</h3>
        {loading && <p className="muted">Loading demand breakdown…</p>}
        {!loading && !byPriority.length && (
          <p className="muted">No demand data available.</p>
        )}
        {byPriority.length > 0 && (
          <div className="bar-chart">
            {byPriority.map((item) => {
              const baselineWidth = maxValue ? (item.baseline / maxValue) * 100 : 0;
              const futureWidth = maxValue ? (item.future / maxValue) * 100 : 0;
              return (
                <div key={item.label} className="bar-row">
                  <div className="bar-label">{item.label}</div>
                  <div className="bar-series">
                    <div className="bar baseline" style={{ width: `${baselineWidth}%` }}>
                      <span>{formatNumber(item.baseline, 1)} MWh</span>
                    </div>
                    <div className="bar future" style={{ width: `${futureWidth}%` }}>
                      <span>{formatNumber(item.future, 1)} MWh</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card">
        <h3>Top Demand Centres (2030)</h3>
        {topConsumers.length ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Cluster</th>
                <th>Baseline (MWh)</th>
                <th>2030 (MWh)</th>
                <th>Recommended Solution</th>
              </tr>
            </thead>
            <tbody>
              {topConsumers.map((row) => (
                <tr key={row.id}>
                  <td>#{row.id}</td>
                  <td>{formatNumber(row.baseline, 1)}</td>
                  <td>{formatNumber(row.future, 1)}</td>
                  <td>{row.solution || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">No demand centres found.</p>
        )}
      </section>
    </div>
  );
};

export default DemandForecastPage;
