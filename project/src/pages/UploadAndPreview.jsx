import React, { useState } from 'react';
import UploadDropzone from '../components/UploadDropzone';
import PreviewRouter from '../components/PreviewRouter';

export default function UploadAndPreview() {
  const [datasets, setDatasets] = useState([]);
  const [active, setActive] = useState(null);

  return (
    <div className="page">
      <h1 className="page-title">Upload GIS Data</h1>
      <UploadDropzone onDatasetsReady={setDatasets} />

      {datasets.length > 0 && (
        <div className="datasets">
          <div className="datasets-title">Detected datasets</div>
          <div className="datasets-grid">
            {datasets.map((d, i) => (
              <button
                key={i}
                onClick={() => setActive(d)}
                className={`dataset-card ${active?.label === d.label ? 'active' : ''}`}
              >
                <div className="dataset-kind">{d.kind}</div>
                <div className="dataset-label">{d.label}</div>
                <div className="dataset-meta">{d.files.length} file(s)</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {active && (
        <div className="preview-wrap">
          <button className="btn close" onClick={() => setActive(null)}>Close preview</button>
          <div className="preview-panel">
            <PreviewRouter dataset={active} onClose={() => setActive(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
