import React, { useState } from "react";

const numberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

const currencyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const Sidebar = ({
  clusters,
  onShowTop5,
  onReset,
  onToggleView,
  viewMode,
  summary,
  demandStats,
  scenarios,
}) => {
  const [showAbout, setShowAbout] = useState(false);
  const [showFormula, setShowFormula] = useState(false);

  return (
    <div className="sidebar-inner">
      <h2 style={{ color: "#3ddc84", marginBottom: "0.5rem" }}>EnergyMap.AI</h2>
      <p>Total clusters: {clusters.length}</p>

      <button className="btn-primary" onClick={onShowTop5}>
        Show Top 5 High-Need Clusters
      </button>

      <button className="btn-secondary" onClick={onReset}>
        Reset All Clusters
      </button>

      <button className="btn-toggle" onClick={onToggleView}>
        Switch to {viewMode === "score" ? "Recommendation" : "Score"} View
      </button>

      <button className="btn-about" onClick={() => setShowAbout(true)}>
        About / Methods
      </button>

      <div className="legend-box">
        <b>
          {viewMode === "score"
            ? "Energy Need Score"
            : "Energy Recommendation"}
        </b>
        {viewMode === "score" ? (
          <ul style={{ listStyle: "none", paddingLeft: 0, fontSize: "0.9rem" }}>
            <li style={{ color: "#d73027" }}>• 80–100 Very High</li>
            <li style={{ color: "#fc8d59" }}>• 60–80 High</li>
            <li style={{ color: "#fee08b" }}>• 40–60 Moderate</li>
            <li style={{ color: "#d9ef8b" }}>• 20–40 Low</li>
            <li style={{ color: "#1a9850" }}>• 0–20 Very Low</li>
          </ul>
        ) : (
          <ul style={{ listStyle: "none", paddingLeft: 0, fontSize: "0.9rem" }}>
            <li style={{ color: "#2b83ba" }}>• Main Grid</li>
            <li style={{ color: "#abdda4" }}>• Mini-grid</li>
            <li style={{ color: "#fdae61" }}>• Off-grid</li>
          </ul>
        )}
      </div>

      {summary && (
        <div className="summary-box">
          <h4>System Snapshot</h4>
          <p>Total clusters processed: {summary.clusters || clusters.length}</p>
          {summary.baseline_demand_mwh_year && (
            <p>
              Baseline demand: {numberFormat.format(summary.baseline_demand_mwh_year)} MWh
            </p>
          )}
          {summary.demand_2030_mwh_year && (
            <p>
              2030 demand: {numberFormat.format(summary.demand_2030_mwh_year)} MWh
            </p>
          )}
          {summary.peak_2030_kw && (
            <p>
              Peak 2030 load: {numberFormat.format(summary.peak_2030_kw)} kW
            </p>
          )}
        </div>
      )}

      {demandStats?.topConsumers?.length ? (
        <div className="summary-box">
          <h4>Top Demand Clusters</h4>
          <ul className="demand-list">
            {demandStats.topConsumers.map((item) => (
              <li key={item.id}>
                <span>#{item.id}</span>
                <span>{numberFormat.format(item.baseline)} → {numberFormat.format(item.future)} MWh</span>
                <small>{item.solution}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {scenarios?.length ? (
        <div className="summary-box">
          <h4>Scenario Highlights</h4>
          <ul className="scenario-list">
            {scenarios.map((scenario) => (
              <li key={scenario.name}>
                <b>{scenario.name}</b>
                <div>
                  {numberFormat.format(scenario.people)} people electrified
                </div>
                <div>
                  Demand Δ {numberFormat.format(scenario.demand)} MWh
                </div>
                <div>
                  Cost {currencyFormat.format(scenario.cost || 0)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* --- About Modal --- */}
      {showAbout && (
        <div className="about-modal">
          <div className="about-content">
            <h3>About EnergyMap.AI</h3>
            <p>
              <strong>EnergyMap.AI</strong> identifies underserved energy
              clusters in Kenya by analyzing geospatial and socioeconomic data
              to estimate electrification needs and recommend viable energy
              pathways.
            </p>

            <h4>🧮 Methodology</h4>
            <p>
              Each cluster receives an <b>Energy Need Score (0–100)</b>, derived
              from three normalized indicators:
            </p>
            <ul>
              <li>
                <b>Population Index</b> — demand potential from population
                density data.
              </li>
              <li>
                <b>Distance to Power</b> — distance (km) to nearest transmission
                line, representing access difficulty.
              </li>
              <li>
                <b>Road Accessibility</b> — total road length, as a proxy for
                logistical feasibility.
              </li>
            </ul>
            <p>
              Each metric is normalized (0–1) and weighted to yield a composite
              <b> Energy Need Score</b>.
            </p>

            {/* --- Collapsible Model Formula Section --- */}
            <div className="formula-section">
              <button
                className="btn-formula"
                onClick={() => setShowFormula(!showFormula)}
              >
                {showFormula ? "Hide Model Formula" : "Show Model Formula"}
              </button>

              {showFormula && (
                <div className="formula-box">
                  <p style={{ marginTop: "0.5rem" }}>
                    The score is computed using a weighted composite model:
                  </p>
                  <pre
                    style={{
                      background: "#000",
                      color: "#3ddc84",
                      padding: "1rem",
                      borderRadius: "8px",
                      fontSize: "0.95rem",
                      overflowX: "auto",
                    }}
                  >
{`Energy_Need_Score = 100 × [
  0.5 × (1 − Road_Norm) +
  0.3 × (1 − Power_Norm) +
  0.2 × Grid_Norm
]`}
                  </pre>
                  <p style={{ fontSize: "0.9rem", color: "#bbb" }}>
                    where:
                    <br />– <b>Road_Norm</b> is normalized road coverage
                    <br />– <b>Power_Norm</b> is normalized proximity to power
                    lines
                    <br />– <b>Grid_Norm</b> is inverse-normalized grid distance
                    (farther = higher need)
                  </p>
                </div>
              )}
            </div>

            <h4>⚡ Recommendation Logic</h4>
            <ul>
              <li>
                <b>Main Grid</b> — dense, accessible, and near existing
                transmission lines.
              </li>
              <li>
                <b>Mini-grid (Solar)</b> — mid-level demand, moderate distance,
                suitable for hybrid systems.
              </li>
              <li>
                <b>Off-grid (Solar)</b> — low-access or isolated clusters best
                served by stand-alone systems.
              </li>
            </ul>

            <h4>🗺️ Data Sources</h4>
            <ul>
              <li>
                <b>Population:</b> WorldPop 2025 (Kenya)
              </li>
              <li>
                <b>Transmission Lines:</b> Global Electrification Platform (GEP)
              </li>
              <li>
                <b>Road Network:</b> OpenStreetMap via Geofabrik
              </li>
              <li>
                <b>Boundaries:</b> GADM (Kenya Level 1)
              </li>
            </ul>

            <p style={{ fontSize: "0.9rem", color: "#bbb" }}>
              Built with ❤️ using Python (GeoPandas, Scikit-learn) and React +
              Leaflet. Developed to support equitable energy planning in
              Sub-Saharan Africa.
            </p>

            <button className="btn-secondary" onClick={() => setShowAbout(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
