import React from "react";

const Legend = () => {
  const grades = [
    { color: "#d73027", label: "80 – 100 Very High" },
    { color: "#fc8d59", label: "60 – 80 High" },
    { color: "#fee08b", label: "40 – 60 Moderate" },
    { color: "#d9ef8b", label: "20 – 40 Low" },
    { color: "#1a9850", label: "0 – 20 Very Low" },
  ];

  return (
    <div
      style={{
        position: "absolute",
        bottom: "20px",
        right: "20px",
        backgroundColor: "rgba(255,255,255,0.9)",
        padding: "10px 14px",
        borderRadius: "8px",
        boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
        fontSize: "14px",
      }}
    >
      <b>Energy Need Score</b>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {grades.map((g) => (
          <li key={g.label} style={{ margin: "4px 0", display: "flex", alignItems: "center" }}>
            <span
              style={{
                backgroundColor: g.color,
                width: "16px",
                height: "16px",
                display: "inline-block",
                marginRight: "8px",
                border: "1px solid #999",
              }}
            ></span>
            {g.label}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Legend;