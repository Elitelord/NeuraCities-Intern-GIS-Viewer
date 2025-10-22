import React, { useEffect, useMemo, useState } from "react";
import MapWorkspace from "../components/MapWorkspace";
import UploadDropzone from "../components/UploadDropzone";
import PreviewRouter from "../components/PreviewRouter";
import ExportPanel from "../components/ExportPanel";
import FloatingToolbar from "../components/FloatingToolbar";

const makeUid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const keyFor = (d) => (d && d.uid) || null;

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

  // Pick first dataset once uploaded (only if nothing active yet)
  useEffect(() => {
    if (datasets.length && !active) setActive(datasets[0]);
  }, [datasets, active]);

  // Append new datasets (assign stable _id) — NEWEST ON TOP, NO DEDUPE, DON’T AUTO-SWITCH IF ACTIVE EXISTS
  const appendDatasets = (newOnes) => {
    if (!Array.isArray(newOnes) || !newOnes.length) return;

    const withIds = newOnes.map((d) => ({ ...d, uid: d.uid || d._id || d.id || makeUid() }));
    setDatasets((prev) => {
      // put new items on TOP so the latest appears first in the legend
      return [...withIds, ...prev];
    });

    // Seed empty style buckets for new ids
    setStyleMap((prev) => {
      const copy = { ...prev };
      for (const d of withIds) if (!copy[d._id]) copy[d._id] = {};
      return copy;
    });

    // Only auto-select if NOTHING is selected yet
    if (!active) {
      const firstNew = withIds[0];
      if (firstNew) setActive(firstNew);
    }

    setIsAddOpen(false);
  };

  const removeDataset = (toRemove) => {
    const id = keyFor(toRemove);

    setDatasets((prev) => {
      const filtered = prev.filter((d) => keyFor(d) !== id);
      const wasActive = active && keyFor(active) === id;
      const nextActive = wasActive ? (filtered[0] || null) : active;

      if (wasActive && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("map:clear"));
      }
      queueMicrotask(() => setActive(nextActive));
      return filtered;
    });

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

  // Merge the ACTIVE dataset with its FC (if we have one) so MapWorkspace doesn’t need fallbacks
  const activeForMap = useMemo(() => {
    if (!active) return null;
    const id = keyFor(active);
    const gj = id ? fcMap[id] : null;
    return gj ? { ...active, geojson: gj } : active;
  }, [active, fcMap]);

  // Attach geojson (if parsed) to each dataset
  const datasetsWithFC = useMemo(() => {
    return datasets.map((d) => {
      const id = keyFor(d);
      const gj = id ? fcMap[id] : null;
      return gj ? { ...d, geojson: gj } : d;
    });
  }, [datasets, fcMap]);

  // Styles for the currently active dataset
  const activeStyle = (activeKey && styleMap[activeKey]) || {};

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
        {/* Always send the selected dataset (active merged with its FC), plus full datasets list with FCs */}
        <MapWorkspace datasets={datasetsWithFC} active={activeForMap} styleOptions={activeStyle} />
      </div>

      {/* Initial upload overlay */}
      {!hasData && (
        <div className="upload-overlay">
          <div className="upload-card">
            <UploadDropzone onDatasetsReady={appendDatasets} />
          </div>
        </div>
      )}

      {/* Preview: parse the current active dataset and bind result to THIS router instance’s id */}
      {hasData && active && (() => {
        const routerDataset = active;          // capture the dataset object given to this router instance
        const routerId = keyFor(routerDataset); // capture its stable id at render time
        return (
          <div style={{ position: "absolute", right: 0, top: 0, zIndex: 2 }}>
            <PreviewRouter
              dataset={routerDataset}
              onGeoJSONReady={({ geojson }) => {
                // Always write parse result under the id of THIS router instance
                if (!routerId) return;
                setFcMap((prev) => ({ ...prev, [routerId]: geojson }));
              }}
            />
          </div>
        );
      })()}

      <ExportPanel
        datasets={datasets}
        selectedDataset={active}
        onSelectDataset={setActive}
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
      />

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
