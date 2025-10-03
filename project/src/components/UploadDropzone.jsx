import React, { useCallback, useRef, useState } from 'react';
import { validateRawFiles } from '../utils/validateFiles';
import { groupFilesByDataset } from '../utils/groupFilesByDataset';

export default function UploadDropzone({ onDatasetsReady }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [errors, setErrors] = useState([]);
  const [progress, setProgress] = useState(0);

  const handleFiles = useCallback(async (fileList) => {
    setErrors([]);
    setProgress(5);
    const vErrs = validateRawFiles(fileList);
    if (vErrs.length) {
      setErrors(vErrs);
      setProgress(0);
      return;
    }
    setProgress(35);

    const { datasets, errors: groupErrors } = groupFilesByDataset(fileList);
    if (groupErrors.length) setErrors(groupErrors);
    setProgress(65);

    setTimeout(() => {
      setProgress(100);
      onDatasetsReady?.(datasets);
      setTimeout(() => setProgress(0), 800);
    }, 250);
  }, [onDatasetsReady]);

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };
  const onBrowse = (e) => {
    handleFiles(e.target.files);
    e.target.value = '';
  };

  return (
    <div className="upload-wrapper">
      <div
        className={`dropzone ${dragOver ? 'drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <p className="dz-title">Drag & drop GIS files here</p>
        <p className="dz-sub">or</p>
        <button className="btn" onClick={() => inputRef.current?.click()}>
          Browse device
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden-input"
          accept=".shp,.shx,.dbf,.prj,.json,.geojson,.csv,.xlsx,.xls,.kml,.kmz,.gpx"
          onChange={onBrowse}
        />
        <p className="dz-hint">
          For shapefiles, include at least <code>.shp</code> and <code>.dbf</code>.
        </p>
      </div>

      {progress > 0 && (
        <div className="progress">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
          <div className="progress-text">Preparing files…</div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="error-box">
          <div className="error-title">Upload issues</div>
          <ul>
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
