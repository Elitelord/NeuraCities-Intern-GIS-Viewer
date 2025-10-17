// src/components/PreviewRouter.jsx
import React from "react";
import ShapefilePreview from "./ShapefilePreview";
import GeojsonPreview from "./GeojsonPreview";
import CsvExcelPreview from "./CsvExcelPreview";
import KmzPreview from "./KmzPreview";

export default function PreviewRouter({ dataset, onGeoJSONReady, onStyleChange }) {
  if (!dataset) return null;

  const emitFC = ({ datasetId, geojson }) => {
    onGeoJSONReady?.({ datasetId, geojson });

    try {
      window.__GEOJSON_CACHE__ = window.__GEOJSON_CACHE__ || {};
      if (datasetId) window.__GEOJSON_CACHE__[datasetId] = geojson;
    } catch {}

    try {
      window.dispatchEvent(new CustomEvent("geojson:ready", { detail: { datasetId, geojson } }));
    } catch {}
  };

  const k = dataset?._id || dataset?.id || dataset?.label || "dataset";

  switch (dataset.kind) {
    case "shapefile":
    case "zip":
      return (
        <ShapefilePreview
          key={k}
          files={dataset.files}
          onClose={() => {}}
          onConvert={(fc) => emitFC({ datasetId: dataset._id, geojson: fc })}
        />
      );

    case "csv":
    case "excel":
      return (
        <CsvExcelPreview
          key={k}
          files={dataset.files}
          onClose={() => {}}
          onConvert={(fc) => emitFC({ datasetId: dataset._id, geojson: fc })}
        />
      );

    case "kmz":
      return (
        <KmzPreview
          key={k}
          files={dataset.files}
          onClose={() => {}}
          onConvert={(fc) => emitFC({ datasetId: dataset._id, geojson: fc })}
        />
      );

    case "geojson":
      return (
        <GeojsonPreview
          key={k}
          files={dataset.files}
          onConvert={(fc) => emitFC({ datasetId: dataset._id, geojson: fc })}
          onStyleChange={onStyleChange}
          hideInlineUI  // 🔒 hide the right-side UI
        />
      );

    default:
      return (
        <GeojsonPreview
          key={k}
          files={dataset.files}
          onConvert={(fc) => emitFC({ datasetId: dataset._id, geojson: fc })}
          onStyleChange={onStyleChange}
          hideInlineUI  // 🔒 hide the right-side UI
        />
      );
  }
}
