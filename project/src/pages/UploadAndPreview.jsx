import React, { useEffect, useState } from "react";
import UploadDropzone from "../components/UploadDropzone";
import PreviewRouter from "../components/PreviewRouter";
import ExportPanel from "../components/ExportPanel";
import MapBackground from "../components/MapBackground";
import FloatingToolbar from "../components/FloatingToolbar";

export default function UploadAndPreview() {
  const [datasets, setDatasets] = useState([]);
  const [active, setActive] = useState(null);
  const [isExportOpen, setIsExportOpen] = useState(false);

  const hasData = datasets.length > 0;

  // When overlay is shown, lock page scroll so dialog stays centered in viewport
  useEffect(() => {
    const overlayVisible = !hasData;
    if (overlayVisible) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev || "";
      };
    }
    return undefined;
  }, [hasData]);

  const handleDatasetsReady = (ds) => {
    setDatasets(ds);
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-100">
      {/* Generic background map - always visible when no preview is active */}
      {!active && (
        <div className="absolute inset-0 z-0">
          <MapBackground activeDataset={null} />
        </div>
      )}

      {/* Upload overlay: appears on top of map background */}
      {!hasData && (
        <div
          className="fixed inset-0 flex items-center justify-center pointer-events-none"
          style={{ zIndex: 50 }}
          role="dialog"
          aria-modal="true"
        >
          {/* Dialog container */}
          <div className="w-full max-w-3xl mx-auto p-6 pointer-events-auto">
            <div
              className="bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-200"
              style={{ maxHeight: "90vh" }}
            >
              {/* Header */}
              <div className="px-6 py-5 border-b bg-gradient-to-r from-teal-50 to-blue-50">
                <h1 className="text-2xl md:text-3xl font-bold text-center text-gray-800">
                  Upload GIS Data
                </h1>
                <p className="text-center text-gray-600 mt-2">
                  Start by uploading your geospatial files
                </p>
              </div>

              {/* Content area with scroll */}
              <div className="p-6 overflow-auto" style={{ maxHeight: "calc(90vh - 120px)" }}>
                <UploadDropzone onDatasetsReady={handleDatasetsReady} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating toolbar (after upload) */}
      {hasData && (
        <div className="absolute bottom-6 left-6" style={{ zIndex: 40 }}>
          <FloatingToolbar
            datasets={datasets}
            active={active}
            onSelect={setActive}
            onAddNew={() => {
              setDatasets([]);
              setActive(null);
            }}
            onExport={() => setIsExportOpen(true)}
          />
        </div>
      )}

      {/* Dataset preview - shows the actual map preview */}
      {active && (
        <div 
          className="absolute inset-0 bg-white"
          style={{ zIndex: 10 }}
        >
          <PreviewRouter dataset={active} />
          
          {/* Close button for preview */}
          <button 
            onClick={() => setActive(null)} 
            className="absolute top-4 right-4 bg-white hover:bg-gray-100 text-gray-700 px-4 py-2 rounded-lg shadow-lg border border-gray-200 font-medium transition-colors"
            style={{ zIndex: 45 }}
          >
            Close Preview
          </button>
        </div>
      )}

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