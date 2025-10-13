// src/pages/UploadAndPreview.jsx
import React, { useEffect, useState } from "react";
import MapWorkspace from "../components/MapWorkspace";
import UploadDropzone from "../components/UploadDropzone";
import PreviewRouter from "../components/PreviewRouter";
import ExportPanel from "../components/ExportPanel";

export default function UploadAndPreview() {
  const [datasets, setDatasets] = useState([]);
  const [active, setActive] = useState(null);
  const [isExportOpen, setIsExportOpen] = useState(false);

  // pick first dataset once uploaded
  useEffect(() => {
    if (datasets.length && !active) setActive(datasets[0]);
  }, [datasets, active]);

  const hasData = datasets.length > 0;

  return (
    <div className="workspace">
      {/* Background map */}
      <div className="map-root">
        <MapWorkspace datasets={datasets} active={active} />
      </div>

      {/* Upload overlay (visible until we have datasets) */}
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
              {datasets.map((d, i) => (
                <button
                  key={i}
                  className={
                    "toolbar-item " + (active?.label === d.label ? "is-active" : "")
                  }
                  onClick={() => setActive(d)}
                >
                  {d.label} — {d.kind}
                </button>
              ))}
            </div>
          </div>

          <div className="toolbar-section">
            <div className="toolbar-title">Actions</div>
            <button className="btn" onClick={() => setIsExportOpen(true)}>
              Export…
            </button>
          </div>
        </div>
      )}

      {/* Floating preview panel (bottom-right) */}
      {hasData && active && (
        <div className="preview-fab">
          <div className="preview-panel">
            <div className="preview-header">
              <div className="text-sm">
                Previewing <strong>{active.label}</strong> — {active.kind}
              </div>
              <button className="btn" onClick={() => setActive(null)}>
                Close preview
              </button>
            </div>

            <PreviewRouter dataset={active} onClose={() => setActive(null)} />
          </div>
        </div>
      )}

      {/* Slide-over export */}
      <ExportPanel
        datasets={datasets}
        selectedDataset={active}
        onSelectDataset={setActive}
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
      />
    </div>
  );
}
