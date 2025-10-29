import React, { useCallback, useRef, useState } from 'react';
import { validateRawFiles } from '../utils/validateFiles';
import { groupFilesByDataset } from '../utils/groupFilesByDataset';

const FONT_STACK =
  "'Montserrat', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif";

export default function UploadDropzone({ onDatasetsReady }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [errors, setErrors] = useState([]);
  const [progress, setProgress] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    setErrors([]);
    setProgress(5);
    setShowSuccess(false);

    const vErrs = validateRawFiles(files);
    if (vErrs.length) {
      setErrors(vErrs);
      setProgress(0);
      return;
    }
    setProgress(35);

    const { datasets, errors: groupErrors } = groupFilesByDataset(files);
    if (groupErrors.length) {
      setErrors(groupErrors);
    }
    setProgress(65);

    setUploadedFiles(files);

    setTimeout(() => {
      setProgress(100);
      setShowSuccess(true);
      if (typeof onDatasetsReady === 'function') {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.debug('[UploadDropzone] emitting datasets:', datasets);
        }
        onDatasetsReady(datasets);
      }
      setTimeout(() => {
        setProgress(0);
        setShowSuccess(false);
      }, 2000);
    }, 250);
  }, [onDatasetsReady]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const onBrowse = (e) => {
    handleFiles(e.target.files);
    e.target.value = '';
  };

  return (
    <div
      className="upload-wrapper max-w-4xl mx-auto pointer-events-auto z-[10001]"
      style={{ fontFamily: FONT_STACK }}
    >
      <div
        className={`dropzone ${dragOver ? 'drag' : ''} border-2 border-dashed rounded-2xl p-8 transition-all ${
          dragOver ? 'border-teal-500 bg-teal-50' : 'border-gray-300 bg-white hover:border-gray-400'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        style={{ fontFamily: FONT_STACK }}
      >
        <div className="text-center">
          <p className="dz-title text-lg font-semibold text-gray-700 mb-2" style={{ fontFamily: FONT_STACK }}>
            Drag & drop GIS files here
          </p>
          <p className="dz-sub text-gray-500 mb-4" style={{ fontFamily: FONT_STACK }}>or</p>
          <button
            className="btn px-6 py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors font-medium"
            type="button"
            style={{ fontFamily: FONT_STACK }}
          >
            Browse device
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden-input"
            accept=".shp,.shx,.dbf,.prj,.sbn,.sbx,.cpg,.json,.geojson,.csv,.xlsx,.xls,.kml,.kmz,.gpx,.tif,.tiff,.dwg,.dxf,.gpkg,.gdb,.mxd,.aprx,.lyr,.lyrx,.pdf,.pdfx,.dgnlib,.las,.laz,.hdf,.img,.osm,.cityjson,.zip"
            onChange={onBrowse}
            style={{ display: 'none' }}
          />
          <p className="dz-hint text-sm text-gray-500 mt-4" style={{ fontFamily: FONT_STACK }}>
            For shapefiles, include at least <code className="bg-gray-100 px-2 py-0.5 rounded-md">.shp</code> and <code className="bg-gray-100 px-2 py-0.5 rounded-md">.dbf</code>
          </p>
          <p className="text-xs text-gray-400 mt-2" style={{ fontFamily: FONT_STACK }}>
            Max 200MB per file • Max 50 files per upload
          </p>
        </div>
      </div>

      <div className="mt-4 max-h-[40vh] overflow-auto" style={{ fontFamily: FONT_STACK }}>
        {progress > 0 && (
          <div className="progress mt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700" style={{ fontFamily: FONT_STACK }}>
                {progress === 100 ? 'Finished: ' : 'Processing files...'}
              </span>
              <span className="text-sm text-gray-600" style={{ fontFamily: FONT_STACK }}>{progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="progress-bar h-2.5 rounded-full transition-all duration-300 bg-teal-600"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {showSuccess && uploadedFiles.length > 0 && (
          <div className="mt-6 bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="flex items-start">
              <div>
                <h4 className="font-semibold text-green-800" style={{ fontFamily: FONT_STACK }}>Upload Successful!</h4>
                <p className="text-sm text-green-700 mt-1" style={{ fontFamily: FONT_STACK }}>
                  {uploadedFiles.length} file{uploadedFiles.length !== 1 ? 's' : ''} uploaded successfully
                </p>
              </div>
            </div>
          </div>
        )}

        {errors.length > 0 && (
          <div className="error-box mt-6 bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-start">
              <div className="flex-1">
                <h4 className="error-title font-semibold text-red-800 mb-2" style={{ fontFamily: FONT_STACK }}>
                  Upload issues
                </h4>
                <ul className="list-disc list-inside space-y-1">
                  {errors.map((e, i) => (
                    <li key={i} className="text-sm text-red-700" style={{ fontFamily: FONT_STACK }}>{e}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
