// src/pages/UploadAndPreview.jsx
import React, { useEffect, useMemo, useState } from "react";
import MapWorkspace from "../components/MapWorkspace";
import UploadDropzone from "../components/UploadDropzone";
import PreviewRouter from "../components/PreviewRouter";
import ExportPanel from "../components/ExportPanel";
import UnifiedLegend from "../components/UnifiedLegend";
import useTimeFilter from "../components/useTimeFilter";

const makeUid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const keyFor = (d) => (d && d.uid) || null;

export default function UploadAndPreview() {
  const [datasets, setDatasets] = useState([]);
  const [active, setActive] = useState(null);

  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const [styleMap, setStyleMap] = useState({});
  const [fcMap, setFcMap] = useState({});

  const [showUploadOverlay, setShowUploadOverlay] = useState(true);

  // time player
  const [selectedField, setSelectedField] = useState(null);

  const hasData = datasets.length > 0;

  useEffect(() => {
    if (hasData) setShowUploadOverlay(false);
  }, [hasData]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setShowUploadOverlay(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (datasets.length && !active) setActive(datasets[0]);
  }, [datasets, active]);

  const toggleDatasetVisible = (target, nextVisible) => {
    const id = keyFor(target);
    setDatasets((prev) =>
      prev.map((d) => (keyFor(d) === id ? { ...d, visible: nextVisible } : d))
    );
  };

  const appendDatasets = (newOnes) => {
    if (!Array.isArray(newOnes) || !newOnes.length) return;

    const withIds = newOnes.map((d) => ({
      ...d,
      uid: d.uid || d._id || d.id || makeUid(),
      visible: d.visible !== false,
    }));

    setDatasets((prev) => [...withIds, ...prev]);
    setShowUploadOverlay(false);

    setStyleMap((prev) => {
      const copy = { ...prev };
      for (const d of withIds) if (!copy[d.uid]) copy[d.uid] = {};
      return copy;
    });

    if (!active) {
      queueMicrotask(() => setActive(withIds[0]));
    }
  };

  const removeDataset = (toRemove) => {
    const id = keyFor(toRemove);

    setDatasets((prev) => {
      const filtered = prev.filter((d) => keyFor(d) !== id);
      const wasActive = active && keyFor(active) === id;
      const nextActive = wasActive ? filtered[0] || null : active;

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

  useEffect(() => {
    const onStyle = (e) => {
      const { path, value } = (e && e.detail) || {};
      if (!path) return;
      setStyleMap((prev) => {
        const id = keyFor(active);
        if (!id) return prev;
        const copy = { ...prev };
        const cur = copy[id] ? { ...copy[id] } : {};
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

  // apply parsed FCs
  const datasetsWithFC = useMemo(() => {
    return (datasets || []).map((d) => {
      const id = keyFor(d);
      const fc = id && fcMap[id];
      return { ...d, geojson: fc || d.geojson || null };
    });
  }, [datasets, fcMap]);

  const visibleDatasets = useMemo(
    () => datasetsWithFC.filter((d) => d.visible !== false && d.geojson),
    [datasetsWithFC]
  );

  const activeStyle = useMemo(
    () => styleMap[keyFor(active)] || {},
    [styleMap, active]
  );

  // define activeForMap BEFORE using it to compute candidateFields
  const activeForMap = useMemo(() => {
    if (!active) return null;
    const id = keyFor(active);
    const fc = id && fcMap[id];
    return fc ? { ...active, geojson: fc } : active;
  }, [active, fcMap]);

  // candidate fields from activeForMap
  const candidateFields = useMemo(() => {
    const props = activeForMap?.geojson?.features?.[0]?.properties || {};
    return Object.keys(props);
  }, [activeForMap]);

  // time filter
  const {
    filteredDatasets,
    domain,
    cursor,
    setCursor,
    playing,
    setPlaying,
    setSpeed,
    setWindowSec,
  } = useTimeFilter(visibleDatasets, selectedField, { windowSec: 60, speed: 1 });

  // auto-pick a likely time field once
  useEffect(() => {
    if (!selectedField && candidateFields?.length) {
      const pref = ["timestamp", "time", "datetime", "date", "ts"];
      const found = pref.find((k) => candidateFields.includes(k));
      if (found) setSelectedField(found);
    }
  }, [candidateFields, selectedField]);

  return (
    <div className="page">
      <div style={{ position: "absolute", left: 12, top: 12, zIndex: 20 }}>
        <button className="btn" onClick={() => setShowUploadOverlay(true)} title="Open Upload">
          ⬆ Upload
        </button>
      </div>

      {hasData && (
        <UnifiedLegend
          datasets={visibleDatasets}
          active={active}
          onSelect={setActive}
          onAdd={() => setIsAddOpen(true)}
          onRemove={removeDataset}
          onToggleVisible={toggleDatasetVisible}
          time={{
            candidateFields,
            selectedField,
            setSelectedField,
            domain,
            cursor,
            setCursor,
            playing,
            setPlaying,
            setSpeed,
            setWindowSec,
          }}
        />
      )}

      <div className="map-root">
        <MapWorkspace
          datasets={filteredDatasets}
          active={activeForMap}
          styleOptions={activeStyle}
          fitOnFirstData={true}   // ← keep overview; don’t re-zoom during playback
        />
      </div>

      {showUploadOverlay && (
        <div
          className="upload-overlay"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.7)",
            display: "grid",
            placeItems: "center",
            zIndex: 10000,
          }}
        >
          <div
            className="upload-card"
            style={{
              position: "relative",
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              width: "min(500px, 90%)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            }}
          >
            <button
              onClick={() => setShowUploadOverlay(false)}
              aria-label="Close upload dialog"
              title="Close upload dialog"
              style={{
                position: "absolute",
                top: 8,
                right: 12,
                background: "transparent",
                border: "none",
                fontSize: 22,
                cursor: "pointer",
                color: "#555",
              }}
            >
              ×
            </button>

            <UploadDropzone onDatasetsReady={appendDatasets} />
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                textAlign: "center",
                color: "#475569",
              }}
            >
              Tip: drag & drop shapefiles or CSV/GeoJSON with timestamps.
            </div>
          </div>
        </div>
      )}

      {hasData &&
        active &&
        (() => {
          const routerDataset = active;
          const routerId = keyFor(routerDataset);
          return (
            <div style={{ position: "absolute", right: 0, top: 0, zIndex: 2 }}>
              <PreviewRouter
                key={routerId}
                dataset={routerDataset}
                onGeoJSONReady={({ geojson, timeInfo }) => {
                  if (!routerId) return;
                  setFcMap((prev) => ({ ...prev, [routerId]: geojson }));
                  if (timeInfo?.field && !selectedField) {
                    setSelectedField(timeInfo.field);
                  }
                }}
              />
            </div>
          );
        })()}

      {isExportOpen && (
        <ExportPanel
          onClose={() => setIsExportOpen(false)}
          datasets={visibleDatasets}
        />
      )}

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
          <div
            style={{
              width: 560,
              maxWidth: "90vw",
              background: "#fff",
              borderRadius: 16,
              padding: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <div className="toolbar-title">Add dataset</div>
              <button className="btn" onClick={() => setIsAddOpen(false)} aria-label="Close">
                ×
              </button>
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
