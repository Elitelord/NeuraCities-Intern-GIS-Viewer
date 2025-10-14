// src/pages/UploadAndPreview.jsx
import React, { useEffect, useMemo, useState } from "react";
import MapWorkspace from "../components/MapWorkspace";
import UploadDropzone from "../components/UploadDropzone";
import PreviewRouter from "../components/PreviewRouter";
import ExportPanel from "../components/ExportPanel";

const keyFor = (d) => (d ? `${d.label}::${d.kind}` : null);

export default function UploadAndPreview() {
  const [datasets, setDatasets] = useState([]);
  const [active, setActive] = useState(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // NEW: per-dataset style state (scoped by dataset key)
  const [styleMap, setStyleMap] = useState({});
  const activeKey = useMemo(() => keyFor(active), [active]);

  // pick first dataset once uploaded
  useEffect(() => {
    if (datasets.length && !active) setActive(datasets[0]);
  }, [datasets, active]);

  const hasData = datasets.length > 0;

  // Merge new datasets into existing (de-dupe by label+kind)
  const appendDatasets = (newOnes) => {
    if (!Array.isArray(newOnes) || !newOnes.length) return;

    setDatasets((prev) => {
      const byKey = new Map(prev.map((d) => [keyFor(d), d]));
      for (const d of newOnes) byKey.set(keyFor(d), d); // replace if same key
      return Array.from(byKey.values());
    });

    // ensure style entry exists for new ones so they don't inherit another dataset's style
    setStyleMap((prev) => {
      const copy = { ...prev };
      for (const d of newOnes) {
        const k = keyFor(d);
        if (!copy[k]) copy[k] = {}; // start blank
      }
      return copy;
    });

    // Auto-select the last uploaded dataset so the preview opens
    const latest = newOnes[newOnes.length - 1];
    if (latest) setActive(latest);

    setIsAddOpen(false);
  };

  const removeDataset = (toRemove) => {
    const removeKey = keyFor(toRemove);
    setDatasets((prev) => {
      const filtered = prev.filter((d) => keyFor(d) !== removeKey);
      if (active && keyFor(active) === removeKey) {
        setActive(filtered[0] || null);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("preview:closed", { detail: { label: toRemove.label } }));
        }
      }

      if (filtered.length === 0 && typeof window !== "undefined") {
        window.dispatchEvent(new Event("map:clear"));
      }
      return filtered;
    });
    // drop its style bucket
    setStyleMap((prev) => {
      const copy = { ...prev };
      delete copy[removeKey];
      return copy;
    });
  };

  // Listen to global style events and write them into the ACTIVE dataset’s style only
  useEffect(() => {
    const onStyle = (e) => {
      if (!activeKey) return;
      const { path, value } = e.detail || {};
      if (!path) return;
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

  // Style to pass to the map (per-dataset)
  const activeStyle = (activeKey && styleMap[activeKey]) || {};

  return (
    <div className="workspace">
      {/* Background map */}
      <div className="map-root">
        <MapWorkspace datasets={datasets} active={active} styleOptions={activeStyle} />
      </div>

      {/* Initial upload overlay (visible until we have datasets) */}
      {!hasData && (
        <div className="upload-overlay">
          <div className="upload-card">
            <UploadDropzone onDatasetsReady={setDatasets} />
          </div>
        </div>
      )}

      {/* Mini toolbar (left) once data is present */}
      {hasData && (
        <div className="mini-toolbar">
          <div className="toolbar-section">
            <div className="toolbar-title">Datasets</div>
            <div className="toolbar-list">
              {datasets.map((d, i) => {
                const isActive = keyFor(active) === keyFor(d);
                return (
                  <div
                    key={`${d.label}::${d.kind}::${i}`}
                    className={"toolbar-item-row " + (isActive ? "is-active" : "")}
                    title={`${d.label} — ${d.kind}`}
                  >
                    <button
                      className={"toolbar-item " + (isActive ? "is-active" : "")}
                      onClick={() => setActive(d)}
                    >
                      {d.label} — {d.kind}
                    </button>
                    <button
                      className="toolbar-icon"
                      aria-label={`Remove ${d.label}`}
                      onClick={() => removeDataset(d)}
                      title="Remove dataset"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="toolbar-section">
            <div className="toolbar-title">Actions</div>
            <div style={{ display: "grid", gap: 8 }}>
              <button className="btn" onClick={() => setIsAddOpen(true)}>
                Add data…
              </button>
              <button className="btn" onClick={() => setIsExportOpen(true)}>
                Export…
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview (header + style are rendered by the preview component) */}
      {hasData && active && <PreviewRouter dataset={active} />}

      {/* Slide-over export */}
      <ExportPanel
        datasets={datasets}
        selectedDataset={active}
        onSelectDataset={setActive}
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
      />

      {/* Add-data overlay */}
      {isAddOpen && (
        <div className="upload-overlay" aria-label="Add dataset overlay">
          <div className="upload-card">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <div className="toolbar-title">Add dataset</div>
              <button className="btn" onClick={() => setIsAddOpen(false)}>
                Close
              </button>
            </div>
            <UploadDropzone onDatasetsReady={appendDatasets} />
            <div style={{ marginTop: 8, fontSize: 12, color: "#475569" }}>
              Tip: you can upload another file at any time. For shapefiles, drop the
              <code> .shp .shx .dbf .prj</code> together.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
