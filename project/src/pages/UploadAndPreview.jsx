import React, { useState } from 'react';
import UploadDropzone from '../components/UploadDropzone';
import PreviewRouter from '../components/PreviewRouter';
import ExportPanel from '../components/ExportPanel';

export default function UploadAndPreview() {
  const [datasets, setDatasets] = useState([]); // set by UploadDropzone -> onDatasetsReady
  const [active, setActive] = useState(null); // currently previewed dataset
  const [isExportOpen, setIsExportOpen] = useState(false);

  return (
    <div className="page relative">
      <h1 className="page-title">Upload GIS Data</h1>

      <UploadDropzone onDatasetsReady={setDatasets} />

      {datasets.length > 0 && (
        <div className="datasets mt-6">
          <div className="datasets-title">Detected datasets</div>
          <div className="datasets-grid mt-2 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {datasets.map((d, i) => (
              <button
                key={i}
                onClick={() => setActive(d)}
                className={`dataset-card p-3 rounded border text-left hover:shadow ${active?.label === d.label ? 'border-teal-600 bg-teal-50' : 'border-gray-200 bg-white'}`}
              >
                <div className="dataset-kind text-xs text-gray-500">{d.kind}</div>
                <div className="dataset-label font-semibold">{d.label}</div>
                <div className="dataset-meta text-xs text-gray-400">{(d.files?.length ?? 0)} file(s)</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {active && (
        <div className="preview-wrap mt-6 relative bg-white border rounded-lg p-4">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3 p-3 bg-white border-b"> 
  
  < button
    onClick={() => setIsExportOpen(true)}
    className="btn" /* Use your simplified CSS class */
  >
    Export
  </button>
  
  <button 
    className="btn" /* Use your simplified CSS class */
    onClick={() => setActive(null)}
  >
    Close preview
  </button>
  
  {/* This text will align nicely in the middle */}
  <div className="text-sm text-gray-600">
    Previewing <strong>{active.label}</strong> — Type: {active.kind}
  </div>

</div>

          </div>

          <div className="preview-panel">
            <PreviewRouter dataset={active} onClose={() => setActive(null)} />
          </div>
        </div>
      )}

      {/* Export slide-over */}
      <ExportPanel
        datasets={datasets}
        selectedDataset={active}
        onSelectDataset={(d) => setActive(d)}
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
      />
    </div>
  );
}