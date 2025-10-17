import React, { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar.jsx";
import MapView from "./components/MapView.jsx";
import "./index.css";

const App = () => {
  const [clusters, setClusters] = useState([]);
  const [viewMode, setViewMode] = useState("score");
  const [allClusters, setAllClusters] = useState([]);

  useEffect(() => {
    fetch("/data/clusters_scored_v2.geojson")
      .then((res) => res.json())
      .then((data) => {
        setClusters(data.features);
        setAllClusters(data.features);
      })
      .catch((err) => console.error("Error loading GeoJSON:", err));
  }, []);

  const handleShowTop5 = () => {
    const top5 = [...allClusters]
      .sort((a, b) => b.properties.Score - a.properties.Score)
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
        />
      </aside>

      <main className="map-section">
        <MapView clusters={clusters} viewMode={viewMode} />
      </main>
    </div>
  );
};

export default App;