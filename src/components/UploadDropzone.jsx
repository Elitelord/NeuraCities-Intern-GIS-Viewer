import React, { useCallback, useRef, useState } from 'react';
import { validateRawFiles } from '../utils/validateFiles';
import { groupFilesByDataset } from '../utils/groupFilesByDataset';

export default function UploadDropzone({ onDatasetsReady }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [errors, setErrors] = useState([]);
  const [progress, setProgress] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleFiles = useCallback(async (fileList) => {
    setErrors([]);
    setProgress(5);
    setShowSuccess(false);

    const vErrs = validateRawFiles(fileList);
    if (vErrs.length) {
      setErrors(vErrs);
      setProgress(0);
      return;
    }
    setProgress(35);

    const { datasets, errors: groupErrors } = groupFilesByDataset(fileList);
    if (groupErrors.length) {
      setErrors(groupErrors);
    }
    setProgress(65);

    setUploadedFiles(Array.from(fileList));

    setTimeout(() => {
      setProgress(100);
      setShowSuccess(true);
      onDatasetsReady?.(datasets);
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
    <div className="upload-wrapper max-w-4xl mx-auto pointer-events-auto z-[10001]">
    <div
      className={`dropzone ${dragOver ? 'drag' : ''} border-2 border-dashed rounded-xl p-8 transition-all ${
        dragOver ? 'border-teal-500 bg-teal-50' : 'border-gray-300 bg-white hover:border-gray-400'
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
        <div className="text-center">
          <p className="dz-title text-xl font-semibold text-gray-700 mb-2">
            Drag & drop GIS files here
          </p>
          <p className="dz-sub text-gray-500 mb-4">or</p>
          <button 
            className="btn px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
            onClick={() => inputRef.current?.click()}
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
          />
          <p className="dz-hint text-sm text-gray-500 mt-4">
            For shapefiles, include at least <code className="bg-gray-100 px-2 py-1 rounded">.shp</code> and <code className="bg-gray-100 px-2 py-1 rounded">.dbf</code>
          </p>
          <p className="text-xs text-gray-400 mt-2">
            Max 200MB per file • Max 50 files per upload
          </p>
        </div>
      </div>
 <div className="mt-4 max-h-[40vh] overflow-auto">
      {progress > 0 && (
        <div className="progress mt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              {progress === 100 ? 'Finished: ' : 'Processing files...'}
            </span>
            <span className="text-sm text-gray-600">{progress}%</span>
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
        <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start">
            <div>
              <h4 className="font-semibold text-green-800">Upload Successful!</h4>
              <p className="text-sm text-green-700 mt-1">
                {uploadedFiles.length} file{uploadedFiles.length !== 1 ? 's' : ''} uploaded successfully
              </p>
            </div>
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="error-box mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start">
            <div className="flex-1">
              <h4 className="error-title font-semibold text-red-800 mb-2">Upload issues</h4>
              <ul className="list-disc list-inside space-y-1">
                {errors.map((e, i) => (
                  <li key={i} className="text-sm text-red-700">{e}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* {uploadedFiles.length > 0 && !showSuccess && progress === 0 && (
        <div className="mt-6 bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="font-semibold text-gray-900 mb-3">
            Uploaded Files ({uploadedFiles.length})
          </h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {uploadedFiles.map((file, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                <div className="flex items-center space-x-3">
            
                  <div>
                    <p className="text-sm font-medium text-gray-900">{file.name}</p>
                    <p className="text-xs text-gray-500">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
               
              </div>
            ))}
          </div>
        </div>
      )} */}

      {/* Supported Formats Info
      <div className="mt-8 bg-white border border-gray-200 rounded-lg p-6">
        <h4 className="font-semibold text-gray-900 mb-4 text-lg">Supported Formats</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          {[
            { name: 'Shapefile', ext: '.shp, .shx, .dbf, .prj', icon: '📊' },
            { name: 'GeoJSON', ext: '.geojson, .json', icon: '🗺️' },
            { name: 'KML/KMZ', ext: '.kml, .kmz', icon: '📍' },
            { name: 'GPX', ext: '.gpx', icon: '🛰️' },
            { name: 'CSV', ext: '.csv (with coordinates)', icon: '📋' },
            { name: 'Excel', ext: '.xlsx, .xls', icon: '📈' },
            { name: 'GeoTIFF', ext: '.tif, .tiff', icon: '🖼️' },
            { name: 'AutoCAD', ext: '.dwg, .dxf', icon: '📐' },
            { name: 'GeoPackage', ext: '.gpkg', icon: '📦' },
            { name: 'File Geodatabase', ext: '.gdb', icon: '🗄️' },
            { name: 'ArcGIS Map', ext: '.mxd, .aprx', icon: '🗺️' },
            { name: 'ArcGIS Layer', ext: '.lyr, .lyrx', icon: '🎨' },
            { name: 'GeoPDF', ext: '.pdf, .pdfx', icon: '📄' },
            { name: 'MicroStation', ext: '.dgnlib', icon: '🏗️' },
            { name: 'LiDAR', ext: '.las, .laz', icon: '📡' },
            { name: 'Raster', ext: '.hdf, .img', icon: '🖼️' },
            { name: 'OpenStreetMap', ext: '.osm', icon: '🗺️' },
            { name: 'CityJSON', ext: '.cityjson', icon: '🏙️' }
          ].map((format, i) => (
            <div key={i} className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors">
              <div className="flex items-center space-x-2 mb-2">
                <span className="text-2xl">{format.icon}</span>
                <p className="font-semibold text-gray-900">{format.name} {format.ext}</p>
                <p className="text-xs text-gray-600"></p>
              </div>
            </div>
          ))}
        </div>
      </div> */}
    </div>
  );
}