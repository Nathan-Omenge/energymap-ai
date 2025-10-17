import React, { useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const MapView = ({ clusters, viewMode }) => {
  useEffect(() => {
    // --- Initialize map ---
    const map = L.map("map").setView([0.1, 37.9], 6);

    // --- Base map tiles ---
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
    }).addTo(map);

    // --- Color logic ---
    const getColorByScore = (score) => {
      if (score >= 80) return "#d73027"; // Very High
      if (score >= 60) return "#fc8d59"; // High
      if (score >= 40) return "#fee08b"; // Moderate
      if (score >= 20) return "#d9ef8b"; // Low
      return "#1a9850"; // Very Low
    };

    const getColorByRecommendation = (rec) => {
      if (!rec) return "#ccc"; // neutral gray for missing recs
      if (rec.toLowerCase().includes("main")) return "#2b83ba";
      if (rec.toLowerCase().includes("mini")) return "#abdda4";
      if (rec.toLowerCase().includes("off")) return "#fdae61";
      return "#ccc";
    };

    const getRadius = (score) => Math.max(6, score / 10);

    // --- Draw clusters ---
    clusters.forEach((feature) => {
      const props = feature.properties || {};
      const coords = feature.geometry?.coordinates;
      if (!coords) return;

      const score = props.Score || 0;
      const rec =
        props.Recommendation ||
        props.recommendation ||
        ""; // removed "Unknown"

      const color =
        viewMode === "recommendation"
          ? getColorByRecommendation(rec)
          : getColorByScore(score);

      const circle = L.circleMarker([coords[1], coords[0]], {
        radius: getRadius(score),
        fillColor: color,
        color: "#555",
        weight: 1,
        fillOpacity: 0.8,
      })
        .addTo(map)
        .bindPopup(
          `<b>Cluster ${props.cluster_id}</b><br>
           Score: ${score.toFixed(2)}<br>
           ${
             rec
               ? `Recommendation: <b style="color:#3ddc84">${rec}</b>`
               : ""
           }`
        );

      circle.on("mouseover", function () {
        this.openPopup();
      });
      circle.on("mouseout", function () {
        this.closePopup();
      });
    });

    // --- Legend ---
    const legend = L.control({ position: "bottomleft" });
    legend.onAdd = function () {
      const div = L.DomUtil.create("div", "info legend");
      div.style.background = "#111";
      div.style.color = "#fff";
      div.style.padding = "10px";
      div.style.borderRadius = "8px";
      div.style.lineHeight = "1.4";

      if (viewMode === "score") {
        div.innerHTML =
          "<b>Energy Need Score</b><br>" +
          '<i style="background:#d73027;width:12px;height:12px;display:inline-block;margin-right:6px;"></i>80–100 Very High<br>' +
          '<i style="background:#fc8d59;width:12px;height:12px;display:inline-block;margin-right:6px;"></i>60–80 High<br>' +
          '<i style="background:#fee08b;width:12px;height:12px;display:inline-block;margin-right:6px;"></i>40–60 Moderate<br>' +
          '<i style="background:#d9ef8b;width:12px;height:12px;display:inline-block;margin-right:6px;"></i>20–40 Low<br>' +
          '<i style="background:#1a9850;width:12px;height:12px;display:inline-block;margin-right:6px;"></i>0–20 Very Low';
      } else {
        div.innerHTML =
          "<b>Energy Recommendation</b><br>" +
          '<i style="background:#2b83ba;width:12px;height:12px;display:inline-block;margin-right:6px;"></i>Main Grid<br>' +
          '<i style="background:#abdda4;width:12px;height:12px;display:inline-block;margin-right:6px;"></i>Mini-grid<br>' +
          '<i style="background:#fdae61;width:12px;height:12px;display:inline-block;margin-right:6px;"></i>Off-grid';
      }
      return div;
    };
    legend.addTo(map);

    return () => map.remove();
  }, [clusters, viewMode]);

  return <div id="map" style={{ height: "100%", width: "100%" }}></div>;
};

export default MapView;