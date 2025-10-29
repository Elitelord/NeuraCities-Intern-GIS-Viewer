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

  const [styleMap, setStyleMap] = useState({});
  const [fcMap, setFcMap] = useState({});

  const hasData = datasets && datasets.length > 0;

  useEffect(() => {
    // Ensure at least one selected after first load
    if (datasets.length && !active) setActive(datasets[0]);
  }, [datasets, active]);

  // Toggle dataset visibility (Legend checkboxes)
  const toggleDatasetVisible = (target, nextVisible) => {
    const id = keyFor(target);
    setDatasets(prev => prev.map(d => keyFor(d) === id ? { ...d, visible: nextVisible } : d));
  };

  // Append new datasets (assign stable _id) — NEWEST ON TOP, NO DEDUPE, DON’T AUTO-SWITCH IF ACTIVE EXISTS
  const appendDatasets = (newOnes) => {
    if (!Array.isArray(newOnes) || !newOnes.length) return;

    const withIds = newOnes.map((d) => ({ ...d, uid: d.uid || d._id || d.id || makeUid(), visible: d.visible !== false }));
    setDatasets((prev) => {
      // put new items on TOP so the latest appears first in the legend
      return [...withIds, ...prev];
    });

    // Seed empty style buckets for new ids
    setStyleMap((prev) => {
      const copy = { ...prev };
      for (const d of withIds) if (!copy[d.uid]) copy[d.uid] = {};
      return copy;
    });

    // Only auto-select if NOTHING is selected yet
    if (!active) {
      queueMicrotask(() => setActive(withIds[0]));
    }
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
      const { path, value } = (e && e.detail) || {};
      if (!path) return;
      setStyleMap((prev) => {
        const id = keyFor(active);
        if (!id) return prev;
        const copy = { ...prev };
        const cur = copy[id] ? { ...copy[id] } : {};
        // set nested property
        const parts = path.split(".");
        let ref = cur;
        for (let i = 0; i < parts.length - 1; i++) {
          const k = parts[i];
          ref[k] = ref[k] || {};
          ref = ref[k];
        }
        ref[parts[parts.length - 1]] = value;
        copy[id] = cur;
        return copy;
      });
    };
    window.addEventListener("geojson:style", onStyle);
    return () => window.removeEventListener("geojson:style", onStyle);
  }, [active]);

  const datasetsWithFC = useMemo(() => {
    return datasets.map((d) => {
      const id = keyFor(d);
      const fc = id && fcMap[id];
      return { ...d, geojson: fc || d.geojson || null };
    });
  }, [datasets, fcMap]);

  const activeStyle = useMemo(() => styleMap[keyFor(active)] || {}, [styleMap, active]);

  const activeForMap = useMemo(() => {
    if (!active) return null;
    const id = keyFor(active);
    const fc = id && fcMap[id];
    return fc ? { ...active, geojson: fc } : active;
  }, [active, fcMap]);

  return (
    <div className="page" style={{ height: "100%" }}>
      {/* Toolbar */}
      {hasData && (
        <FloatingToolbar
          datasets={datasetsWithFC}
          active={active}
          onSelect={setActive}
          onAddNew={() => setIsAddOpen(true)}
          onExport={() => setIsExportOpen(true)}
          onRemove={removeDataset}
          onToggleVisible={toggleDatasetVisible}
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
              key = {routerId}
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

      {/* Export */}
      {isExportOpen && (
        <ExportPanel onClose={() => setIsExportOpen(false)} datasets={datasetsWithFC} />
      )}

      {/* Add dataset modal */}
      {isAddOpen && (
        <div
          className="fixed-overlay-top"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.4)",
            display: "grid",
            placeItems: "center",
            zIndex: 10030,
          }}
        >
          <div style={{ width: 560, maxWidth: "90vw", background: "#fff", borderRadius: 16, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div className="toolbar-title">Add dataset</div>
              <button className="btn" onClick={() => setIsAddOpen(false)} aria-label="Close">×</button>
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
