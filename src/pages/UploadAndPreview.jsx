// src/pages/UploadAndPreview.jsx
import React, { useEffect, useMemo, useState } from "react";
import MapWorkspace from "../components/MapWorkspace";
import UploadDropzone from "../components/UploadDropzone";
import PreviewRouter from "../components/PreviewRouter";
import ExportPanel from "../components/ExportPanel";
import FloatingToolbar from "../components/FloatingToolbar";

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const keyFor = (d) => (d ? d._id : null);

export default function UploadAndPreview() {
  const [datasets, setDatasets] = useState([]);
  const [active, setActive] = useState(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Per-dataset style + parsed FeatureCollection
  const [styleMap, setStyleMap] = useState({}); // id -> style
  const [fcMap, setFcMap] = useState({});       // id -> FeatureCollection
  const activeKey = useMemo(() => keyFor(active), [active]);

  const hasData = datasets.length > 0;

  // Pick first dataset once uploaded
  useEffect(() => {
    if (datasets.length && !active) setActive(datasets[0]);
  }, [datasets, active]);

  // Append new datasets (assign stable _id)
  const appendDatasets = (newOnes) => {
    if (!Array.isArray(newOnes) || !newOnes.length) return;

    // assign ids
    const withIds = newOnes.map((d) => ({ ...d, _id: d._id || uid() }));

    setDatasets((prev) => {
      // de-dupe by label+kind, but keep ids for new ones
      const byKey = new Map(prev.map((d) => [`${d.label}::${d.kind}`, d]));
      for (const d of withIds) byKey.set(`${d.label}::${d.kind}`, d);
      return Array.from(byKey.values());
    });

    // seed empty style buckets for new ids
    setStyleMap((prev) => {
      const copy = { ...prev };
      for (const d of withIds) if (!copy[d._id]) copy[d._id] = {};
      return copy;
    });

    // auto-select last uploaded dataset
    const latest = withIds[withIds.length - 1];
    if (latest) setActive(latest);

    setIsAddOpen(false);
  };

  const removeDataset = (toRemove) => {
    const id = keyFor(toRemove);

    setDatasets((prev) => {
      // 1) build the new list first
      const filtered = prev.filter((d) => d._id !== id);

      // 2) decide who should be active *before* we call any setters
      const wasActive = active && active._id === id;
      const nextActive = wasActive ? (filtered[0] || null) : active;

      // 3) clear the map immediately if we just removed the active dataset
      if (wasActive && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("map:clear"));
      }

      // 4) update active on the next tick to avoid reducer timing issues
      queueMicrotask(() => setActive(nextActive));

      return filtered;
    });

    // 5) drop style + geojson buckets for the removed id
    setStyleMap((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setFcMap((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  // Scope style events to ACTIVE dataset only
  useEffect(() => {
    const onStyle = (e) => {
      const { path, value } = e.detail || {};
      if (!path || !activeKey) return;
      setStyleMap((prev) => {
        const next = { ...prev };
        const bucket = { ...(next[activeKey] || {}) };
        const [group, key] = String(path).split(".");
        bucket[group] = { ...(bucket[group] || {}) };
        bucket[group][key] = value;
        next[activeKey] = bucket;
        return next;
      });
    };
    window.addEventListener("geojson:style", onStyle);
    return () => window.removeEventListener("geojson:style", onStyle);
  }, [activeKey]);

  // What to send to the map
  const activeStyle = (activeKey && styleMap[activeKey]) || {};
  const activeGeoJSON = activeKey ? fcMap[activeKey] : null;
  const activeForMap = active && activeGeoJSON ? { ...active, geojson: activeGeoJSON } : null;

  return (
    <div className="workspace" style={{ position: "relative", height: "100vh" }}>
      {/* Left legend + style controls */}
      {hasData && (
        <FloatingToolbar
          datasets={datasets}
          active={active}
          onSelect={setActive}
          onAddNew={() => setIsAddOpen(true)}
          onExport={() => setIsExportOpen(true)}
          onRemove={removeDataset}
        />
      )}

      {/* Map */}
      <div className="map-root" style={{ position: "absolute", inset: 0, zIndex: 1 }}>
        <MapWorkspace active={activeForMap} styleOptions={activeStyle} />
      </div>

      {/* Initial upload overlay */}
      {!hasData && (
        <div className="upload-overlay">
          <div className="upload-card">
            <UploadDropzone onDatasetsReady={appendDatasets} />
          </div>
        </div>
      )}

      {/* Preview: parses to FC and returns with the dataset id */}
      {hasData && active && (
        <div style={{ position: "absolute", right: 0, top: 0, zIndex: 2 }}>
          <PreviewRouter
            dataset={active}
            onGeoJSONReady={({ datasetId, geojson }) => {
              setFcMap((prev) => ({ ...prev, [datasetId]: geojson }));
            }}
          />
        </div>
      )}

      {/* Export modal/panel (unchanged) */}
      <ExportPanel
        datasets={datasets}
        selectedDataset={active}
        onSelectDataset={setActive}
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
      />

      {/* Add modal using the same dropzone */}
      {isAddOpen && (
        <div className="upload-overlay" aria-label="Add dataset overlay">
          <div className="upload-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div className="toolbar-title">Add dataset</div>
              <button className="btn" onClick={() => setIsAddOpen(false)}>Close</button>
            </div>
            <UploadDropzone onDatasetsReady={appendDatasets} />
            <div style={{ marginTop: 8, fontSize: 12, color: "#475569" }}>
              Tip: drop <code>.shp .shx .dbf .prj</code> together for shapefiles.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
