import { useEffect, useMemo, useState } from "react";

const DemandForecastPage = () => {
  const [summary, setSummary] = useState(null);
  const [byPriority, setByPriority] = useState([]);
  const [bySettlement, setBySettlement] = useState([]);
  const [topConsumers, setTopConsumers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCountyPicker, setShowCountyPicker] = useState(false);
  const apiBase = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
  const simulatedCounties = useMemo(() => {
    return [
      "Nairobi",
      "Mombasa",
      "Kisumu",
      "Nakuru",
      "Uasin Gishu",
      "Machakos",
      "Kiambu",
      "Kakamega",
      "Nyeri",
      "Meru",
      "Kisii",
      "Garissa",
      "Turkana",
      "Bungoma",
      "Kericho",
      "Laikipia",
    ];
  }, []);
  const categorizeSettlement = (population) => {
    if (typeof population !== "number") return "Rural";
    if (population >= 4000) return "Urban";
    if (population >= 2000) return "Peri-Urban";
    return "Rural";
  };

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
        const settlementAggregation = new Map();
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

          const settlementKey = categorizeSettlement(props.estimated_population);
          if (!settlementAggregation.has(settlementKey)) {
            settlementAggregation.set(settlementKey, {
              label: settlementKey,
              baseline: 0,
              future: 0,
              clusters: 0,
            });
          }
          const settlementBucket = settlementAggregation.get(settlementKey);
          settlementBucket.baseline += props.baseline_demand_mwh_year || 0;
          settlementBucket.future += props.demand_2030_mwh_year || 0;
          settlementBucket.clusters += 1;
        });

        const priorityArray = Array.from(aggregation.values()).sort((a, b) => {
          const order = { High: 0, Medium: 1, Low: 2 };
          return (order[a.label] ?? 99) - (order[b.label] ?? 99);
        });
        const settlementOrder = { Urban: 0, "Peri-Urban": 1, Rural: 2 };
        const settlementArray = Array.from(settlementAggregation.values()).sort(
          (a, b) => (settlementOrder[a.label] ?? 99) - (settlementOrder[b.label] ?? 99)
        );

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
        setBySettlement(settlementArray);
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
  const settlementMaxValue = useMemo(() => {
    const values = bySettlement.flatMap((item) => [item.baseline, item.future]);
    return values.length ? Math.max(...values) : 0;
  }, [bySettlement]);
  const demandGrowthSeries = useMemo(() => {
    const baseline = summary?.baseline_demand_mwh_year;
    const forecast = summary?.demand_2030_mwh_year;
    if (typeof baseline !== "number" || typeof forecast !== "number") return [];
    const startYear = 2024;
    const endYear = 2030;
    const steps = endYear - startYear;
    if (steps <= 0) {
      return [
        { year: startYear, value: baseline },
        { year: endYear, value: forecast },
      ];
    }

    if (baseline > 0 && forecast > 0) {
      const logBaseline = Math.log(baseline);
      const logForecast = Math.log(forecast);
      return Array.from({ length: steps + 1 }, (_, index) => {
        const fraction = index / steps;
        const logValue = logBaseline + (logForecast - logBaseline) * fraction;
        return { year: startYear + index, value: Math.exp(logValue) };
      });
    }

    const change = forecast - baseline;
    return Array.from({ length: steps + 1 }, (_, index) => ({
      year: startYear + index,
      value: baseline + (change * index) / steps,
    }));
  }, [summary]);
  const demandGrowthChart = useMemo(() => {
    if (!demandGrowthSeries.length) {
      return {
        linePath: "",
        areaPath: "",
        points: [],
        width: 320,
        height: 160,
        padding: 28,
      };
    }
    const width = 320;
    const height = 160;
    const padding = 28;
    const values = demandGrowthSeries.map((item) => item.value);
    const maxValue = Math.max(...values);
    const minValue = Math.min(...values);
    const rangeRaw = maxValue - minValue;
    const range = rangeRaw === 0 ? Math.max(maxValue, 1) : rangeRaw;
    const xStep =
      demandGrowthSeries.length > 1
        ? (width - padding * 2) / (demandGrowthSeries.length - 1)
        : 0;
    const coords = demandGrowthSeries.map((point, index) => {
      const x = padding + index * xStep;
      const y =
        height - padding - ((point.value - minValue) / range) * (height - padding * 2);
      return { ...point, x, y };
    });
    const linePath = coords
      .map((coord, index) => `${index === 0 ? "M" : "L"}${coord.x},${coord.y}`)
      .join(" ");

    let areaPath = "";
    if (coords.length === 1) {
      const base = height - padding;
      const single = coords[0];
      areaPath = `M${single.x - 10},${base} L${single.x},${single.y} L${single.x + 10},${base} Z`;
    } else {
      areaPath = [
        `M${coords[0].x},${height - padding}`,
        ...coords.map((coord) => `L${coord.x},${coord.y}`),
        `L${coords[coords.length - 1].x},${height - padding}`,
        "Z",
      ].join(" ");
    }

    return {
      linePath,
      areaPath,
      points: coords,
      width,
      height,
      padding,
      maxValue,
      minValue,
    };
  }, [demandGrowthSeries]);
  const demandGrowthPercent = useMemo(() => {
    const baseline = summary?.baseline_demand_mwh_year;
    const forecast = summary?.demand_2030_mwh_year;
    if (typeof baseline !== "number" || typeof forecast !== "number" || baseline === 0) {
      return null;
    }
    return ((forecast - baseline) / baseline) * 100;
  }, [summary]);

  const formatNumber = (value, decimals = 1) =>
    typeof value === "number"
      ? value.toLocaleString("en-US", { maximumFractionDigits: decimals })
      : "-";

  const handleCountyToggle = () => setShowCountyPicker((prev) => !prev);

  return (
    <div className="page-container">
      <header className="page-header">
        <h1>Demand Forecasting</h1>
        <p>
          Demand projections combine baseline consumption with population growth,
          electrification targets, and economic development assumptions drawn from
          the pipeline configuration.
        </p>
        <div className="control-row">
          <button
            type="button"
            className="btn-secondary"
            onClick={handleCountyToggle}
            aria-expanded={showCountyPicker}
          >
            {showCountyPicker ? "Hide Kenya Regions" : "Select Regions in Kenya"}
          </button>
          {showCountyPicker && (
            <div className="county-simulation" role="region" aria-label="Simulated Kenyan counties">
              <div className="county-grid">
                {simulatedCounties.map((county) => (
                  <button
                    type="button"
                    key={county}
                    className={`county-pill${
                      county === "Nairobi" ? " county-pill-active" : ""
                    }`}
                  >
                    {county}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
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

      <section className="two-column">
        <article className="card">
          <h3>Demand Growth Projection</h3>
          {!demandGrowthSeries.length ? (
            <p className="muted">Projection unavailable.</p>
          ) : (
            <>
              <div
                className="line-chart"
                role="img"
                aria-label="Demand projection from 2024 to 2030"
              >
                <svg
                  viewBox={`0 0 ${demandGrowthChart.width} ${demandGrowthChart.height}`}
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="growthGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(61, 220, 132, 0.45)" />
                      <stop offset="100%" stopColor="rgba(61, 220, 132, 0)" />
                    </linearGradient>
                  </defs>
                  <path className="line-area" d={demandGrowthChart.areaPath} />
                  <path className="line-stroke" d={demandGrowthChart.linePath} />
                  {demandGrowthChart.points.map((point) => (
                    <circle key={point.year} cx={point.x} cy={point.y} r="3" />
                  ))}
                </svg>
                <div className="chart-axis">
                  {demandGrowthChart.points.map((point) => (
                    <span key={point.year}>{point.year}</span>
                  ))}
                </div>
              </div>
              {typeof demandGrowthPercent === "number" && (
                <p className="muted">
                  ≈ {formatNumber(demandGrowthPercent, 1)}% increase over baseline.
                </p>
              )}
            </>
          )}
        </article>

        <article className="card">
          <h3>Demand by Settlement Category</h3>
          {loading && <p className="muted">Loading settlement mix…</p>}
          {!loading && !bySettlement.length && (
            <p className="muted">No settlement data available.</p>
          )}
          {bySettlement.length > 0 && (
            <>
              <div className="settlement-chart">
                {bySettlement.map((item) => {
                  const baselineHeight = settlementMaxValue
                    ? (item.baseline / settlementMaxValue) * 100
                    : 0;
                  const futureHeight = settlementMaxValue
                    ? (item.future / settlementMaxValue) * 100
                    : 0;
                  return (
                    <div key={item.label} className="settlement-column">
                      <div className="column-group" aria-hidden="true">
                        <div
                          className="column baseline"
                          style={{ height: `${baselineHeight}%` }}
                        />
                        <div
                          className="column future"
                          style={{ height: `${futureHeight}%` }}
                        />
                      </div>
                      <span className="column-label">{item.label}</span>
                      <span className="column-value">
                        {formatNumber(item.future, 0)} MWh
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mini-legend">
                <span className="legend-item">
                  <span className="swatch baseline" />
                  Baseline
                </span>
                <span className="legend-item">
                  <span className="swatch future" />
                  2030
                </span>
              </div>
            </>
          )}
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
