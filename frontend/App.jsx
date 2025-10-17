import React, { useEffect, useState } from "react";
import MapView from "./components/MapView";

function App() {
  const [clusters, setClusters] = useState([]);

  useEffect(() => {
    // Load the GeoJSON from public/data
    fetch("/data/clusters_scored.geojson")
      .then((res) => res.json())
      .then((data) => {
        console.log("✅ Loaded clusters:", data.features?.length);
        setClusters(data.features || []);
      })
      .catch((err) => console.error("❌ Error loading clusters:", err));
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Sidebar */}
      <div
        style={{
          width: "350px",
          backgroundColor: "#111",
          color: "#fff",
          padding: "20px",
          overflowY: "auto",
        }}
      >
        <h2 style={{ color: "#5dd97c" }}>EnergyMap.AI</h2>
        <p>
          <b>Total clusters:</b> {clusters.length}
        </p>
        <button
          onClick={() => {
            const topClusters = clusters
              .sort(
                (a, b) =>
                  b.properties.Score - a.properties.Score
              )
              .slice(0, 5);
            setClusters([...topClusters]);
          }}
          style={{
            backgroundColor: "#3ddc84",
            border: "none",
            color: "#000",
            padding: "10px 20px",
            borderRadius: "8px",
            cursor: "pointer",
            fontWeight: "600",
          }}
        >
          Show Top 5 High-Need Clusters
        </button>

        <ul>
          {clusters.slice(0, 20).map((c) => (
            <li key={c.properties.cluster_id}>
              Cluster {c.properties.cluster_id} — Score:{" "}
              {c.properties.Score.toFixed(2)}
            </li>
          ))}
        </ul>
      </div>

      {/* Map */}
      <div style={{ flexGrow: 1 }}>
        <MapView clusters={clusters} />
      </div>
    </div>
  );
}

export default App;