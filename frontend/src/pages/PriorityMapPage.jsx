import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar.jsx";
import MapView from "../components/MapView.jsx";

const PriorityMapPage = () => {
  const [clusters, setClusters] = useState([]);
  const [allClusters, setAllClusters] = useState([]);
  const [viewMode, setViewMode] = useState("score");
  const [summaryStats, setSummaryStats] = useState(null);
  const [demandStats, setDemandStats] = useState({ meta: null, topConsumers: [] });
  const [scenarioComparison, setScenarioComparison] = useState([]);

  const apiBase = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

  useEffect(() => {
    const controller = new AbortController();

    const loadClusters = async () => {
      try {
        const res = await fetch(`${apiBase}/clusters`, { signal: controller.signal });
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const payload = await res.json();
        const features = payload?.data?.features || [];
        if (!features.length) throw new Error("API returned no features");
        setClusters(features);
        setAllClusters(features);
        return;
      } catch (err) {
        if (err.name === "AbortError") return;
        console.warn("Cluster API unavailable, using static fallback", err);
      }

      try {
        const fallback = await fetch("/data/clusters_enriched.geojson", {
          signal: controller.signal,
        });
        if (!fallback.ok) throw new Error(`Fallback fetch failed ${fallback.status}`);
        const payload = await fallback.json();
        const features = payload?.features || [];
        setClusters(features);
        setAllClusters(features);
      } catch (fallbackErr) {
        if (fallbackErr.name === "AbortError") return;
        console.error("Failed to load cluster fallback", fallbackErr);
      }
    };

    const loadSummary = async () => {
      try {
        const res = await fetch(`${apiBase}/summary`, { signal: controller.signal });
        if (!res.ok) throw new Error(`Summary API error ${res.status}`);
        const payload = await res.json();
        setSummaryStats(payload);
      } catch (err) {
        if (err.name === "AbortError") return;
        console.warn("Summary API unavailable", err);
        try {
          const fallback = await fetch("/data/summary_metrics.json", {
            signal: controller.signal,
          });
          if (!fallback.ok) return;
          const data = await fallback.json();
          setSummaryStats(data);
        } catch (fallbackErr) {
          console.warn("Summary fallback failed", fallbackErr);
        }
      }
    };

    const loadDemand = async () => {
      try {
        const res = await fetch(`${apiBase}/forecasts`, { signal: controller.signal });
        if (!res.ok) throw new Error(`Forecast API error ${res.status}`);
        const payload = await res.json();
        const features = payload?.data?.features || [];

        const totals = features.reduce(
          (acc, feature) => {
            const props = feature.properties || {};
            acc.baseline += props.baseline_demand_mwh_year || 0;
            acc.future += props.demand_2030_mwh_year || 0;
            acc.count += 1;
            return acc;
          },
          { baseline: 0, future: 0, count: 0 }
        );

        const topConsumers = [...features]
          .sort(
            (a, b) =>
              (b.properties?.baseline_demand_mwh_year || 0) -
              (a.properties?.baseline_demand_mwh_year || 0)
          )
          .slice(0, 5)
          .map((feature) => ({
            id: feature.properties?.cluster_id,
            baseline: feature.properties?.baseline_demand_mwh_year || 0,
            future: feature.properties?.demand_2030_mwh_year || 0,
            solution: feature.properties?.recommended_solution || "",
          }));

        setDemandStats({
          meta: {
            baseline: totals.baseline,
            future: totals.future,
            clusters: totals.count,
          },
          topConsumers,
        });
      } catch (err) {
        if (err.name === "AbortError") return;
        console.warn("Forecast API unavailable", err);
      }
    };

    const loadScenarios = async () => {
      try {
        const res = await fetch(`${apiBase}/scenarios`, { signal: controller.signal });
        if (!res.ok) throw new Error(`Scenarios API error ${res.status}`);
        const payload = await res.json();
        const comparison = (payload?.comparison || []).map((entry) => ({
          name: entry.scenario_name,
          people: Number(entry.people_electrified || 0),
          demand: Number(entry.demand_increase_mwh || 0),
          cost: Number(entry.cost_usd || 0),
          rate: Number(entry.electrification_rate || 0),
        }));
        setScenarioComparison(comparison);
      } catch (err) {
        if (err.name === "AbortError") return;
        console.warn("Scenarios API unavailable", err);
      }
    };

    loadClusters();
    loadSummary();
    loadDemand();
    loadScenarios();

    return () => controller.abort();
  }, [apiBase]);

  const handleShowTop5 = () => {
    const top5 = [...allClusters]
      .sort((a, b) => {
        const scoreA = a.properties.priority_score ?? a.properties.Score ?? 0;
        const scoreB = b.properties.priority_score ?? b.properties.Score ?? 0;
        return scoreB - scoreA;
      })
      .slice(0, 5);
    setClusters(top5);
  };

  const handleReset = () => setClusters(allClusters);
  const handleToggleView = () =>
    setViewMode(viewMode === "score" ? "recommendation" : "score");

  return (
    <div className="app-wrapper">
      <aside className="sidebar">
        <Sidebar
          clusters={clusters}
          onShowTop5={handleShowTop5}
          onReset={handleReset}
          onToggleView={handleToggleView}
          viewMode={viewMode}
          summary={summaryStats}
          demandStats={demandStats}
          scenarios={scenarioComparison}
        />
      </aside>
      <main className="map-section">
        <MapView clusters={clusters} viewMode={viewMode} />
      </main>
    </div>
  );
};

export default PriorityMapPage;
