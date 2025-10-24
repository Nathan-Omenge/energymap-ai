#!/usr/bin/env node

/**
 * Recompute priority scoring fields for the cluster GeoJSON dataset.
 *
 * This script mimics the scoring flow shown in the ElectroMap sample backend:
 *  - load GeoJSON features
 *  - derive normalized indicators (0-10 scale)
 *  - combine indicators using configurable weights
 *  - assign priority categories and a recommended solution
 *  - write an enriched GeoJSON file alongside a lightweight CSV summary
 *
 * Running it locally lets us validate the scoring pipeline before wiring it
 * into an API service. Later, the React front end can consume the enriched
 * GeoJSON to power filter, chart, and scenario views.
 *
 * Usage: `node scripts/recalculateScores.mjs`
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const INPUT_PATH = resolve(__dirname, "..", "public", "data", "clusters_scored_v2.geojson");
const OUTPUT_GEOJSON_PATH = resolve(__dirname, "..", "public", "data", "clusters_enriched.geojson");
const OUTPUT_CSV_PATH = resolve(__dirname, "..", "public", "data", "clusters_enriched_summary.csv");

const WEIGHTS = {
  population: 0.30,
  accessGap: 0.25,
  economicActivity: 0.20,
  socialNeed: 0.15,
  gridProximity: 0.10,
};

const PRIORITY_THRESHOLDS = {
  high: 7.0,
  medium: 5.0,
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const normalizeToTen = (values, { invert = false } = {}) => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) {
    return values.map(() => 5);
  }
  return values.map((value) => {
    const normalized = (value - min) / (max - min);
    const adjusted = invert ? 1 - normalized : normalized;
    return clamp(adjusted * 10, 0, 10);
  });
};

const recommendSolution = ({ distanceKm, populationIndex, roadDensityScore }) => {
  if (distanceKm <= 5 && populationIndex >= 0.6) return "grid_extension";
  if (distanceKm <= 15 && populationIndex >= 0.3 && roadDensityScore >= 0.5) {
    return "mini_grid_hybrid";
  }
  if (distanceKm > 25 && populationIndex < 0.2) return "standalone_solar";
  return "mini_grid_solar";
};

const priorityCategory = (compositeScore) => {
  if (compositeScore >= PRIORITY_THRESHOLDS.high) return "High";
  if (compositeScore >= PRIORITY_THRESHOLDS.medium) return "Medium";
  return "Low";
};

const loadGeoJSON = (path) => {
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw);
};

const writeGeoJSON = (path, geojson) => {
  writeFileSync(path, JSON.stringify(geojson, null, 2), "utf-8");
};

const writeCsv = (path, features) => {
  const header = [
    "cluster_id",
    "priority_score",
    "priority_category",
    "recommended_solution",
    "population_score",
    "access_gap_score",
    "economic_score",
    "social_need_score",
    "grid_proximity_score",
  ];

  const rows = features.map((feature) => {
    const props = feature.properties;
    return [
      props.cluster_id,
      props.priority_score.toFixed(2),
      props.priority_category,
      props.recommended_solution,
      props.population_score.toFixed(2),
      props.access_gap_score.toFixed(2),
      props.economic_score.toFixed(2),
      props.social_need_score.toFixed(2),
      props.grid_proximity_score.toFixed(2),
    ].join(",");
  });

  writeFileSync(path, [header.join(","), ...rows].join("\n"), "utf-8");
};

const enrichFeatures = (features) => {
  const getProp = (feature, key, fallback = 0) =>
    Number.parseFloat(feature.properties?.[key]) || fallback;

  const populationValues = features.map((feature) => getProp(feature, "norm_pop", 0));
  const accessGapValues = features.map((feature) => getProp(feature, "grid_norm", 0));
  const economicValues = features.map((feature) => getProp(feature, "total_road_km", 0));
  const socialValues = features.map((feature) => getProp(feature, "need_level_weight", 0));
  const gridProximityValues = features.map((feature) => getProp(feature, "dist_to_power_km", 0));

  const populationScores = normalizeToTen(populationValues);
  const accessGapScores = normalizeToTen(accessGapValues);
  const economicScores = normalizeToTen(economicValues);

  const socialAdjustedValues = socialValues.map((value, index) => {
    if (value) return value;
    const pop = populationValues[index];
    return Math.exp(-Math.abs(pop - 0.4));
  });
  const socialScores = normalizeToTen(socialAdjustedValues);

  const gridScores = normalizeToTen(gridProximityValues, { invert: true });

  return features.map((feature, index) => {
    const props = feature.properties ?? {};
    const populationScore = populationScores[index];
    const accessGapScore = accessGapScores[index];
    const economicScore = economicScores[index];
    const socialNeedScore = socialScores[index];
    const gridProximityScore = gridScores[index];

    const priorityScore =
      WEIGHTS.population * populationScore +
      WEIGHTS.accessGap * accessGapScore +
      WEIGHTS.economicActivity * economicScore +
      WEIGHTS.socialNeed * socialNeedScore +
      WEIGHTS.gridProximity * gridProximityScore;

    const recommended = recommendSolution({
      distanceKm: getProp(feature, "dist_to_power_km", 50),
      populationIndex: populationValues[index],
      roadDensityScore: clamp(economicScore / 10, 0, 1),
    });

    const category = priorityCategory(priorityScore);

    return {
      ...feature,
      properties: {
        ...props,
        population_score: Number(populationScore.toFixed(2)),
        access_gap_score: Number(accessGapScore.toFixed(2)),
        economic_score: Number(economicScore.toFixed(2)),
        social_need_score: Number(socialNeedScore.toFixed(2)),
        grid_proximity_score: Number(gridProximityScore.toFixed(2)),
        priority_score: Number(priorityScore.toFixed(2)),
        priority_category: category,
        recommended_solution: recommended,
        scoring_metadata: {
          weights: WEIGHTS,
          generated_at: new Date().toISOString(),
          source: "scripts/recalculateScores.mjs",
        },
      },
    };
  });
};

const main = () => {
  console.log("🔄  Loading cluster GeoJSON…");
  const geojson = loadGeoJSON(INPUT_PATH);
  if (!geojson?.features?.length) {
    throw new Error("No features found in input GeoJSON.");
  }

  console.log(`✅  Loaded ${geojson.features.length} features`);

  console.log("🧮  Recomputing priority scores…");
  const enrichedFeatures = enrichFeatures(geojson.features);

  const enrichedGeoJSON = { ...geojson, features: enrichedFeatures };

  console.log(`💾  Writing enriched GeoJSON → ${OUTPUT_GEOJSON_PATH}`);
  writeGeoJSON(OUTPUT_GEOJSON_PATH, enrichedGeoJSON);

  console.log(`📊  Writing CSV summary → ${OUTPUT_CSV_PATH}`);
  writeCsv(OUTPUT_CSV_PATH, enrichedFeatures);

  console.log("🎉  Done. Enriched dataset ready for inspection.");
};

main();

