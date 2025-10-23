// ExportPanel.jsx
import React, { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import JSZip from 'jszip'; // if not already imported
import { csvToGeoJSON, kmzToGeoJSON,  gpxToGeoJSON, shapefileToGeoJSON} from './converters/fromFiles';
import { geojsonToCSV, geojsonToKMZ, geojsonToKML, geojsonToGPX, geojsonToShapefile, geojsonToPNG_MapCapture, geojsonToPNG_SVG } from './converters/geojsonConverters';
import shp from 'shpjs';
import { rasterizeGeoJSONToCanvas,  writeGeoTIFFWithGeoTiffJS, geojsonBBox } from '../utils/geotiffExport';


/**
 * ExportPanel (robust download)
 *
 * - Improved createAndDownload with multiple fallbacks and explicit user-visible failures.
 * - Keeps blob URL around until panel closes or user clears it.
 * - Shows "View file" / "Download" links after generation.
 * - Allows editing the middle filename; prefix is fixed to "NeuraCities-" and extension shown.
 */

export default function ExportPanel({
  datasets = [],
  selectedDataset = null,
  onSelectDataset = () => {},
  isOpen = false,
  onClose = () => {}
}) {
  const [exportConfig, setExportConfig] = useState({
    format: 'geojson',
    crs: 'EPSG:4326',
    quality: 'high',
    includeMetadata: true,
    simplifyGeometry: false,
    compressionLevel: 'none'
  });
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportSuccess, setExportSuccess] = useState(false);

  const [lastBlobUrl, setLastBlobUrl] = useState(null);
  const [lastFilename, setLastFilename] = useState(null);
  const [downloadError, setDownloadError] = useState(null);

  // NEW: filename editor (user edits only the middle portion)
  const FIXED_PREFIX = 'NeuraCities-'; // as requested (fixed and uneditable)
  const [userFilename, setUserFilename] = useState(''); // without prefix or extension

  // when selectedDataset changes, set a sensible initial userFilename (sanitized)
  useEffect(() => {
    if (selectedDataset) {
      const base = (selectedDataset.label || 'dataset');
      setUserFilename(sanitizeFilename(base.replace(/^NeuraCities-?/i, ''))); // remove prefix if present
    }
  }, [selectedDataset]);

  // lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
    return;
  }, [isOpen]);

  // revoke blob url on close
  useEffect(() => {
    if (!isOpen) {
      if (lastBlobUrl) {
        try { URL.revokeObjectURL(lastBlobUrl); } catch (e) { /* ignore */ }
        setLastBlobUrl(null);
        setLastFilename(null);
      }
      setExporting(false);
      setExportProgress(0);
      setExportSuccess(false);
      setDownloadError(null);
    }
  }, [isOpen]);

  const revokeLastBlob = () => {
    if (lastBlobUrl) {
      try { URL.revokeObjectURL(lastBlobUrl); } catch (e) { /* ignore */ }
      setLastBlobUrl(null);
      setLastFilename(null);
    }
  };

  // helper: sanitize the user-provided filename chunk
  function sanitizeFilename(name) {
    if (!name) return '';
    // remove extension if present, remove unsafe chars, collapse whitespace, replace spaces with underscores
    let s = String(name).trim();
    // remove extension if user pasted one
    s = s.replace(/\.[a-z0-9]{1,8}$/i, '');
    // remove forbidden Windows filename chars and control chars
    s = s.replace(/[\\\/:*?"<>|]/g, '');
    // collapse whitespace and replace with underscore
    s = s.replace(/\s+/g, '_');
    // keep only basic safe chars, limit length
    s = s.replace(/[^a-zA-Z0-9_\-\.]/g, '');
    if (s.length > 120) s = s.slice(0, 120);
    return s || '';
  }

  const getFileExtension = (format) => {
    const map = { geojson: 'geojson', png: 'png', shapefile: 'zip', kml: 'kml', kmz: 'kmz', gpx: 'gpx', csv: 'csv', excel: 'xlsx', geotiff: 'tif', 'autocad-dxf': 'dxf', geopackage: 'gpkg', topojson: 'topojson', svg: 'svg', wkt: 'wkt' };
    return map[format] || 'zip';
  };

  // build the final filename using prefix + userFilename (sanitized) + extension
  const buildFilename = (ext) => {
    const middle = sanitizeFilename(userFilename) || sanitizeFilename(selectedDataset?.label || 'dataset');
    return `${FIXED_PREFIX}${middle}.${ext}`;
  };

    async function resolveGeoJSONForExport(dataset) {
    // 1) already attached by previews?
    if (dataset?.geojson?.type === 'FeatureCollection') return dataset.geojson;
  
    // 2) if the dataset is a raw .geojson/.json file, parse it now
    const f = dataset?.files?.[0];
    if (f && /\.(geojson|json)$/i.test(f.name)) {
      const text = await f.text();
      const j = JSON.parse(text);
      if (j?.type === 'FeatureCollection') return j;
      if (j?.type === 'Feature') return { type: 'FeatureCollection', features: [j] };
      if (j?.type) return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: j }] };
    }

    // NEW: if the uploaded file is GPX, convert it on-demand
    if (f && /\.gpx$/i.test(f.name)) {
      try {
        const gj = await gpxToGeoJSON(f);
        if (gj && gj.type === 'FeatureCollection') return gj;
      } catch (err) {
        // throw a helpful error to be handled by caller
        throw new Error('GPX → GeoJSON conversion failed: ' + (err.message || err));
      }
    }
  
    // 3) last-resort: preview cache (we set this in step 2 below)
    if (typeof window !== 'undefined') {
      const cache = window.__GEOJSON_CACHE__;
      if (cache && dataset?.label && cache[dataset.label]?.type === 'FeatureCollection') {
        return cache[dataset.label];
      }
    }
  
    throw new Error('No GeoJSON available for KML export');
  }

  /** Shapefile dataset -> GeoJSON FeatureCollection (zip OR loose .shp + .dbf) */
async function shapefileDatasetToGeoJSON(dataset) {
  if (!dataset?.files?.length) throw new Error('No files on dataset');

  // Case A: single .zip containing the shapefile
  const zip = dataset.files.find(f => /\.zip$/i.test(f.name));
  if (zip) {
    const ab = await zip.arrayBuffer();
    const out = await shp(ab); // shpjs auto-detects zip buffers
    if (out?.type === 'FeatureCollection') return out;
    if (out && typeof out === 'object') {
      // shpjs may return { layerName: FeatureCollection, ... }
      const all = [];
      for (const k of Object.keys(out)) {
        const fc = out[k];
        if (fc?.type === 'FeatureCollection' && Array.isArray(fc.features)) {
          all.push(...fc.features);
        }
      }
      if (all.length) return { type: 'FeatureCollection', features: all };
    }
    throw new Error('Could not parse shapefile zip.');
  }

  // Case B: loose .shp + .dbf (optional .shx/.prj)
  const shpFile = dataset.files.find(f => /\.shp$/i.test(f.name));
  const dbfFile = dataset.files.find(f => /\.dbf$/i.test(f.name));
  if (shpFile && dbfFile) {
    const [shpBuf, dbfBuf] = await Promise.all([shpFile.arrayBuffer(), dbfFile.arrayBuffer()]);
    const geoms = await shp.parseShp(shpBuf);
    const recs  = await shp.parseDbf(dbfBuf);
    const features = (geoms || []).map((g, i) => ({
      type: 'Feature',
      geometry: g,
      properties: recs?.[i] || {}
    }));
    if (!features.length) throw new Error('No features parsed from .shp/.dbf');
    return { type: 'FeatureCollection', features };
  }

  throw new Error('Provide a .zip, or both .shp and .dbf.');
}

/** Try multiple places to get a FeatureCollection for export */
async function resolveGeoJSONForExport(dataset) {
  // 1) if the preview already attached a FC
  if (dataset?.geojson?.type === 'FeatureCollection') return dataset.geojson;

  // 2) if the preview cached by label
  if (typeof window !== 'undefined' && dataset?.label) {
    const cache = window.__GEOJSON_CACHE__;
    if (cache && cache[dataset.label]?.type === 'FeatureCollection') return cache[dataset.label];
  }

  // 3) parse raw .geojson/.json file if that’s what was uploaded
  const file = dataset?.files?.[0];
  if (file && /\.(geo)?json$/i.test(file.name)) {
    const text = await file.text();
    const j = JSON.parse(text);
    if (j?.type === 'FeatureCollection') return j;
    if (j?.type === 'Feature') return { type: 'FeatureCollection', features: [j] };
    if (j?.type) return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: j }] };
    throw new Error('JSON file is not valid GeoJSON.');
  }

  // 4) shapefile datasets (zip OR loose set)
  if (dataset?.kind === 'shapefile') {
    return await shapefileDatasetToGeoJSON(dataset);
  }

  // (other kinds keep using your existing logic)
  throw new Error('No GeoJSON available for export for this dataset.');
}


  

  /**
   * Robust download helper:
   * 1) If IE/Edge legacy supports msSaveOrOpenBlob -> use it
   * 2) Create <a download> and dispatch MouseEvent('click') (more reliable than a.click())
   * 3) If that fails, try window.open(blobUrl)
   * 4) Report error to UI and console for debugging
   */
  const createAndDownload = (filename, blob) => {
    console.log('[ExportPanel] createAndDownload called', { filename, blob });
    revokeLastBlob();
    setDownloadError(null);

    const url = URL.createObjectURL(blob);
    setLastBlobUrl(url);
    setLastFilename(filename);
    console.log('[ExportPanel] Blob URL created:', url, 'size:', blob.size);

    // Try msSaveOrOpenBlob (IE)
    try {
      if (navigator && typeof navigator.msSaveOrOpenBlob === 'function') {
        console.debug('[ExportPanel] Trying msSaveOrOpenBlob...');
        navigator.msSaveOrOpenBlob(blob, filename);
        console.debug('[ExportPanel] msSaveOrOpenBlob succeeded');
        return true;
      }
    } catch (e) {
      console.warn('[ExportPanel] msSaveOrOpenBlob failed', e);
    }

    // Try programmatic anchor click
    try {
      console.debug('[ExportPanel] Trying anchor click download...');
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      a.target = '_blank';
      document.body.appendChild(a);

      const evt = new MouseEvent('click', { view: window, bubbles: true, cancelable: true });
      const canceled = !a.dispatchEvent(evt);
      document.body.removeChild(a);

      console.debug('[ExportPanel] Anchor click dispatched, canceled?', canceled);
      if (!canceled) return true;
    } catch (err) {
      console.error('[ExportPanel] Anchor click download failed', err);
    }

    // Fallback: open in new tab
    try {
      console.debug('[ExportPanel] Trying window.open fallback...');
      const newWindow = window.open(url, '_blank');
      console.debug('[ExportPanel] window.open result:', newWindow);
      if (newWindow) return true;
    } catch (err) {
      console.error('[ExportPanel] window.open fallback failed', err);
    }

    setDownloadError('Automatic download blocked; use "Download" link or "View file" button.');
    console.error('[ExportPanel] All automatic download attempts failed for', filename);
    return false;
  };

  const exportGeoJSON = async (dataset) => {
    console.log('[ExportPanel] exportGeoJSON called', dataset);
    if (!dataset) {
      console.warn('[ExportPanel] No dataset provided');
      setDownloadError('No dataset provided.');
      return null;
    }

    let fc = null;

    try {
      // 1) Already a FeatureCollection object
      if (dataset.type === 'FeatureCollection' && Array.isArray(dataset.features)) {
        fc = dataset;
      }
      // 2) Has features array but isn't labeled FeatureCollection
      else if (Array.isArray(dataset.features)) {
        fc = { type: 'FeatureCollection', features: dataset.features };
      }
      // 3) Has an attached geojson property (from preview or previous conversion)
      else if (dataset.geojson && dataset.geojson.type === 'FeatureCollection') {
        fc = dataset.geojson;
      }
      // 4) If there's an uploaded file and it's a .geojson file, read and parse it
      else if (dataset.files && dataset.files.length > 0) {
        const file = dataset.files[0];
        const name = (file.name || '').toLowerCase();

        // If it's a plain geojson file, parse it
        if (name.endsWith('.geojson') || name.endsWith('.json')) {
          try {
            const text = await file.text();
            const json = JSON.parse(text);
            if (json.type === 'FeatureCollection') fc = json;
            else if (json.type === 'Feature') fc = { type: 'FeatureCollection', features: [json] };
            else if (json.type) fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: json }] };
            else {
              setDownloadError('Uploaded JSON is not valid GeoJSON.');
              return null;
            }
          } catch (err) {
            console.error('[ExportPanel] Parsing uploaded geojson failed', err);
            setDownloadError('Failed to parse uploaded GeoJSON: ' + (err.message || err));
            return null;
          }
        }
        // If it's a KMZ or CSV file, attempt on-demand converters (keep existing behavior)
        else if (dataset.kind === 'kmz' || name.endsWith('.kmz')) {
          try {
            fc = await kmzToGeoJSON(file);
          } catch (err) {
            console.error('[ExportPanel] kmzToGeoJSON failed', err);
            setDownloadError('KMZ → GeoJSON conversion failed: ' + (err.message || err));
            return null;
          }
        } else if (dataset.kind === 'csv' || name.endsWith('.csv')) {
          try {
            fc = await csvToGeoJSON(file);
            if (!fc || !Array.isArray(fc.features) || fc.features.length === 0) {
              setDownloadError('CSV conversion yielded no mappable features (no coordinate columns found).');
              return null;
            }
          } catch (err) {
            console.error('[ExportPanel] csvToGeoJSON failed', err);
            setDownloadError('CSV → GeoJSON conversion failed: ' + (err.message || err));
            return null;
          }
        } 
         else if (dataset.kind === 'gpx' || name.endsWith('.kmz')) {
          try {
            fc = await gpxToGeoJSON(file);
          } catch (err) {
            console.error('[ExportPanel] gpxToGeoJSON failed', err);
            setDownloadError('GPX → GeoJSON conversion failed: ' + (err.message || err));
            return null;
          }
        }
        else if (dataset.kind === 'shapefile') {
          try {
            fc = await shapefileToGeoJSON(file);

          } catch(err) {
            console.error('[ExportPanel] shapefiletoGeoJSON failed', err);
            setDownloadError('Shapefile -> geoJson conversion failed: ' + (err.message || err));
          }
        }
        else {
          console.warn('[ExportPanel] No on-demand converter for dataset kind:', dataset.kind, file && file.name);
          setDownloadError('No on-demand converter available for this file type.');
          return null;
        }
      } else {
        console.warn('[ExportPanel] Could not determine GeoJSON from dataset', dataset);
        setDownloadError('Could not determine GeoJSON from selected dataset.');
        return null;
      }

      // Final validation
      if (!fc || !Array.isArray(fc.features)) {
        console.warn('[ExportPanel] Conversion produced invalid FeatureCollection', fc);
        setDownloadError('Converted GeoJSON is invalid.');
        return null;
      }

      // expose for debugging
      try { window.__DEBUG_LAST_GEOJSON__ = fc; } catch (e) {}

      // Build download (use buildFilename so the user's chosen name is used)
      const filename = buildFilename(getFileExtension('geojson'));
      const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json;charset=utf-8' });
      createAndDownload(filename, blob);
      console.log('[ExportPanel] FeatureCollection prepared & downloaded', fc.features.length);

      // Return the parsed FeatureCollection so callers (e.g. exportCSV) can reuse it
      return fc;
    } catch (err) {
      console.error('[ExportPanel] exportGeoJSON unexpected error', err);
      setDownloadError('ExportGeoJSON failed: ' + (err.message || err));
      return null;
    }
  };

  // Replace the old exportCSV with this
  // Make sure exportGeoJSON is defined above and is async (as we changed earlier).
  const exportCSV = async (dataset) => {
    console.log('[ExportPanel] exportCSV called', dataset);
    if (!dataset) {
      setDownloadError('No dataset provided.');
      return null;
    }

    let fc = null;

    // Prefer explicit FeatureCollection sources
    if (dataset.type === 'FeatureCollection' && Array.isArray(dataset.features)) {
      fc = dataset;
    } else if (dataset.features && Array.isArray(dataset.features)) {
      fc = { type: 'FeatureCollection', features: dataset.features };
    } else if (dataset.geojson && dataset.geojson.type === 'FeatureCollection') {
      fc = dataset.geojson;
    }

    // If we still don't have fc, try to obtain it via exportGeoJSON (this will convert files if needed)
    if (!fc) {
      try {
        console.log('[ExportPanel] No FeatureCollection found locally, attempting exportGeoJSON(...) to obtain one');
        const maybeFc = await exportGeoJSON(dataset);
        if (maybeFc && maybeFc.type === 'FeatureCollection') {
          fc = maybeFc;
        } else if (dataset.geojson && dataset.geojson.type === 'FeatureCollection') {
          fc = dataset.geojson;
        } else if (window.__DEBUG_LAST_GEOJSON__ && window.__DEBUG_LAST_GEOJSON__.type === 'FeatureCollection') {
          fc = window.__DEBUG_LAST_GEOJSON__;
        }
      } catch (err) {
        console.error('[ExportPanel] exportGeoJSON (for CSV) failed', err);
        setDownloadError('Conversion to GeoJSON failed: ' + (err.message || err));
        return null;
      }
    }

    // If still no FeatureCollection, but dataset.rows exist, export rows as CSV
    if (!fc || !Array.isArray(fc.features) || fc.features.length === 0) {
      if (dataset.rows && Array.isArray(dataset.rows) && dataset.rows.length) {
        const rows = dataset.rows;
        const keys = Array.from(rows.reduce((acc, r) => { Object.keys(r || {}).forEach(k => acc.add(k)); return acc; }, new Set()));
        const csvLines = [ keys.join(','), ...rows.map(r => keys.map(k => {
          const v = r[k];
          if (v === null || v === undefined) return '';
          const s = String(v).replace(/"/g, '""');
          return s.includes(',') || s.includes('"') ? `"${s}"` : s;
        }).join(',')) ];
        const filename = buildFilename(getFileExtension('csv'));
        const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        createAndDownload(filename, blob);
        return filename;
      }

      console.warn('[ExportPanel] exportCSV cannot locate GeoJSON or rows');
      setDownloadError('No geojson/features/rows available for CSV export.');
      return null;
    }

    // Now convert FeatureCollection -> CSV using your converter
    try {
      const { blob, filename: returnedName } = geojsonToCSV(fc, { geometry: 'wkt', includeProperties: true });
      const outBlob = blob instanceof Blob ? blob : new Blob([blob], { type: 'text/csv;charset=utf-8;' });
      const finalName = buildFilename(getFileExtension('csv'));
      createAndDownload(finalName, outBlob);
      return finalName;
    } catch (err) {
      console.error('[ExportPanel] geojsonToCSV failed', err);
      setDownloadError('CSV export failed: ' + (err.message || err));
      return null;
    }
  };

  // KML / KMZ export
  const exportKMZ = async (dataset) => {
    console.log('[ExportPanel] exportKMZ called', dataset);
    let fc = null;
    if (dataset.type === 'FeatureCollection') fc = dataset;
    else if (dataset.features && Array.isArray(dataset.features)) fc = { type: 'FeatureCollection', features: dataset.features };
    else if (dataset.geojson) fc = dataset.geojson;
    else {
      console.warn('[ExportPanel] exportKMZ could not find GeoJSON in dataset');
      setDownloadError('No geojson/features available for KMZ export.');
      return null;
    }

    try {
      const { blob, filename: returnedName } = await geojsonToKMZ(fc, { nameField: 'name' });
      const finalName = buildFilename(getFileExtension('kmz'));
      createAndDownload(finalName, blob);
      return finalName;
    } catch (err) {
      console.error('[ExportPanel] exportKMZ failed', err);
      setDownloadError('KMZ export failed (see console).');
      return null;
    }
  };

  const handleExport = useCallback(() => {
    console.log('[ExportPanel] handleExport called', { selectedDataset, exportConfig });
    if (!selectedDataset) {
      console.warn('[ExportPanel] No dataset selected');
      setDownloadError('No dataset selected.');
      return;
    }

    setExporting(true);
    setExportProgress(0);
    setExportSuccess(false);
    setDownloadError(null);

    const interval = setInterval(() => {
      setExportProgress(prev => {
        const next = Math.min(prev + 12, 100);

        if (next >= 100) {
          clearInterval(interval);
          console.log('[ExportPanel] Conversion progress reached 100%, starting export');

          (async () => {
            try {
              // Always await the result; export functions can be sync or async.
              if (exportConfig.format === 'geojson') {
                if (selectedDataset?.kind === 'shapefile') {
                  try {
                    const ds = selectedDataset;
                    const fc = await shapefileDatasetToGeoJSON(ds);
                    window.__DEBUG_LAST_GEOJSON__ = fc;
                    console.info('[Export] Shapefile FC ready — features:', fc?.features?.length ?? 0);
                    const filename = buildFilename(getFileExtension('geojson'));
                    const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json;charset=utf-8' });
                    createAndDownload(filename, blob);
                    return;
                  } catch (err) {
                    console.error('[ExportPanel] shapefileDatasetToGeoJSON failed', err);
                    setDownloadError('Shapefile → GeoJSON conversion failed: ' + (err.message || err));
                    return;
                  }
                }
                const fc = await exportGeoJSON(selectedDataset); // fc returned, .geojson already downloaded
                console.log('[ExportPanel] exportGeoJSON produced fc with', fc?.features?.length, 'features');
              }
              else if (exportConfig.format === 'csv') {
                const fc = await resolveGeoJSONForExport(selectedDataset)
                const filename = await exportCSV(fc);
                console.log('[ExportPanel] exportCSV returned filename:', filename);
              } 
              else if (exportConfig.format === 'png') {
                const fc = await resolveGeoJSONForExport(selectedDataset);
                console.log(fc)
                const {blob, filename} = await geojsonToPNG_MapCapture(fc, {
                width: 1400,
                height: 900,
                tileUrl: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                tileLoadTimeout: 5000,
                nameField: selectedDataset.name
              });
                console.log('[ExportPanel] after converter result', { filename, blob });


                createAndDownload( filename, blob);
              }
              else if (exportConfig.format === 'kml') {
                try {
                  const fc = await resolveGeoJSONForExport(selectedDataset);
                  const { kmlText, filename } = geojsonToKML(fc);
                  const blob = new Blob([kmlText], { type: 'application/vnd.google-earth.kml+xml' });
                  const outName = buildFilename('kml') || filename;
                  createAndDownload(outName, blob);
                  console.log('[ExportPanel] KML exported:', outName);
                } catch (err) {
                  console.error('[ExportPanel] KML export failed', err);
                  setDownloadError('KML export failed: ' + (err?.message || err));
                }
              }
              else if (exportConfig.format === 'shapefile') {
                try {
                  const fc = await resolveGeoJSONForExport(selectedDataset);
                  const { blob, filename: returnedName } = await geojsonToShapefile(fc);
                  createAndDownload(buildFilename('zip'), blob);
                } catch (err) {
                  setDownloadError('Shapefile export failed: ' + (err?.message || err));
                  console.error('Shapefile export failed', err);
                }
              }
              else if (exportConfig.format === 'kmz') {
                const filename = await Promise.resolve(exportKMZ(selectedDataset));
                console.log('[ExportPanel] exportKMZ returned filename:', filename);
              } else if (exportConfig.format === 'gpx') {
                try {
                  const fc = await resolveGeoJSONForExport(selectedDataset);
                  const { gpxText, filename } = geojsonToGPX(fc, { nameField: 'name', includeProperties: true });
                  const blob = new Blob([gpxText], { type: 'application/gpx+xml;charset=utf-8' });
                  const outName = buildFilename('gpx') || filename;
                  createAndDownload(outName, blob);
                  console.log('[ExportPanel] GPX exported:', outName);
                } catch (err) {
                  console.error('[ExportPanel] GPX export failed', err);
                  setDownloadError('GPX export failed: ' + (err?.message || err));
                }
              }
              else if (exportConfig.format === 'geotiff') {
                // inside the geotiff export branch in ExportPanel.jsx
                  try {
                    // Resolve GeoJSON for export (reuse your resolveGeoJSONForExport)
                    const fc = await resolveGeoJSONForExport(selectedDataset);
                    if (!fc || !Array.isArray(fc.features) || fc.features.length === 0) {
                      setDownloadError('GeoTIFF export requires GeoJSON with features.');
                    } else {
                      // Choose resolution (you can expose in UI); default 1024
                      const width = 1024;
                      const height = 1024;

                      // compute bbox and optionally expand a little
                      const bbox = geojsonBBox(fc);
                      // Optionally pad bbox by 1-2% to avoid clipped edges
                      const padX = (bbox.maxX - bbox.minX) * 0.02;
                      const padY = (bbox.maxY - bbox.minY) * 0.02;
                      const padded = { minX: bbox.minX - padX, minY: bbox.minY - padY, maxX: bbox.maxX + padX, maxY: bbox.maxY + padY };

                      // Rasterize
                        const { canvas, imageData } = rasterizeGeoJSONToCanvas(fc, width, height, padded);
                      const arrayBuffer = await writeGeoTIFFWithGeoTiffJS(imageData.data, width, height, padded, { samples: 3, bitsPerSample: 8, compression: 'NONE' });
                      const blob = new Blob([arrayBuffer], { type: 'image/tiff' });
                      createAndDownload(buildFilename('tif'), blob);
                      // create blob and download   
                    }
                  } catch (err) {
                    console.error('[ExportPanel] geotiff export failed', err);
                    setDownloadError('GeoTIFF export failed: ' + (err.message || err));
                  }
                }
              
 
              else {
                console.log('[ExportPanel] placeholder export for format:', exportConfig.format);
                const ext = getFileExtension(exportConfig.format);
                const filename = buildFilename(ext);
                const mime = (exportConfig.format === 'shapefile' || exportConfig.format === 'geopackage') ? 'application/zip' : 'application/octet-stream';
                const placeholder = new Blob([`Export placeholder: ${filename}\nFormat: ${exportConfig.format}\nCRS: ${exportConfig.crs}`], { type: mime });
                createAndDownload(filename, placeholder);
              }
            } catch (err) {
              console.error('[ExportPanel] Export exception', err);
              setDownloadError('Export failed (see console).');
            } finally {
              // finalize UI state
              setTimeout(() => {
                setExporting(false);
                setExportSuccess(true);
                setTimeout(() => setExportSuccess(false), 3000);
              }, 300);
            }
          })();

          return 100;
        }

        return next;
      });
    }, 160);
  }, [selectedDataset, exportConfig, userFilename]);

  if (!isOpen) return null;

const panel = (
  <>
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.35)',
        zIndex: 2147483600
      }}
      onClick={onClose}
      aria-hidden="true"
    />
      <style>{`
    @keyframes fadeIn {
      from { opacity: 0; transform: translate(-50%, -48%); }
      to   { opacity: 1; transform: translate(-50%, -50%); }
    }
  `}</style>
      <aside
    role="dialog"
    aria-modal="true"
    style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      height: 'auto',
      maxHeight: '85vh',
      width: '100%',
      maxWidth: '520px',
      background: '#fff',
      zIndex: 2147483647,
      boxShadow: 'rgba(0,0,0,0.35) 0px 8px 40px',
      overflow: 'auto',
      pointerEvents: 'auto',
      borderRadius: 12,
      animation: 'fadeIn 180ms ease-out' // <-- fade-in
    }}
  >
        <div
          style={{
            padding: 20,
            minHeight: '100%',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start'
            }}
          >
            <div  style = {{alignItems: 'center'}}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700}}>
                Convert & Export
              </h2>
          
            </div>
            <div>
              <button
                onClick={onClose}
                className="btn"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  padding: 0,
                  borderRadius: '6px',
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M5.29289 5.29289C5.68342 4.90237 6.31658 4.90237 6.70711 5.29289L12 10.5858L17.2929 5.29289C17.6834 4.90237 18.3166 4.90237 18.7071 5.29289C19.0976 5.68342 19.0976 6.31658 18.7071 6.70711L13.4142 12L18.7071 17.2929C19.0976 17.6834 19.0976 18.3166 18.7071 18.7071C18.3166 19.0976 17.6834 19.0976 17.2929 18.7071L12 13.4142L6.70711 18.7071C6.31658 19.0976 5.68342 19.0976 5.29289 18.7071C4.90237 18.3166 4.90237 17.6834 5.29289 17.2929L10.5858 12L5.29289 6.70711C4.90237 6.31658 4.90237 5.68342 5.29289 5.29289Z"
                    fill="#0F1729"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* 🔹 Aligned CRS and Dataset selectors */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              marginTop: 8,
              alignItems: 'end'
            }}
          >
            <div style={{ marginTop: 16 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#374151',
                  marginBottom: 8
                }}
              >
                Select Dataset to Export
              </label>
              <select
                value={datasets.indexOf(selectedDataset)}
                onChange={(e) =>
                  onSelectDataset(datasets[parseInt(e.target.value, 10)])
                }
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb'
                }}
              >
                {datasets.map((d, i) => (
                  <option key={i} value={i}>
                    {d.label} ({d.kind || 'unknown'})
                    {/* {d.size ? `${(d.size / 1024).toFixed(1)} KB` : '—'} */}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginTop: 16 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 8,
                  color: '#374151'
                }}
              >
                CRS
              </label>
              <select
                value={exportConfig.crs}
                onChange={(e) =>
                  setExportConfig({ ...exportConfig, crs: e.target.value })
                }
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb'
                }}
              >
                <option value="EPSG:4326">WGS84 (EPSG:4326)</option>
                <option value="EPSG:3857">Web Mercator (EPSG:3857)</option>
                <option value="EPSG:32633">UTM 33N</option>
              </select>
            </div>
          </div>

        {/* filename editor: fixed prefix + editable middle + extension */}
  <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Filename</div>
    </label>

    {/* wrapper that determines the "content width" to match for button + progress */}
    <div style={{ width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', boxSizing: 'border-box' }}>
        <span style={{ background: '#f3f4f6', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', color: '#374151', fontSize: 13 }}>{FIXED_PREFIX}</span>
        <input
          type="text"
          value={userFilename}
          onChange={(e) => setUserFilename(sanitizeFilename(e.target.value))}
          placeholder={sanitizeFilename(selectedDataset?.label || 'dataset')}
          style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #e5e7eb', minWidth: 120, boxSizing: 'border-box' }}
          aria-label="Filename (without prefix or extension)"
        />
        <select
          value={exportConfig.format}
          onChange={(e) => setExportConfig({ ...exportConfig, format: e.target.value })}
          style={{ padding: '10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fafafa', fontSize: 13, boxSizing: 'border-box' }}
        >
          {/* <optgroup label="Vector"> */}
            <option value="geojson">.geojson</option>
            <option value="shapefile">.shp</option>
            <option value="kml">.kml</option>
            <option value="gpx">.gpx</option>
          {/* </optgroup>
          <optgroup label="Tabular"> */}
            <option value="csv">.csv</option>
            <option value="excel">.xlsx</option>
            <option value="png">.png</option>
            {/* </optgroup>
          <optgroup label="Raster/CAD"> */}
          <option value="geotiff">.tif</option>
          {/* <option value="autocad-dxf">.dxf</option> */}
          {/* </optgroup> */}
        </select>
      </div>

      {/* Final filename preview — stays full width
      <div style={{ width: '100%', fontSize: 12, color: '#6b7280' }}>
        Final filename will be:&nbsp;
        <strong>{FIXED_PREFIX}{sanitizeFilename(userFilename) || sanitizeFilename(selectedDataset?.label || 'dataset')}.{getFileExtension(exportConfig.format)}</strong>
      </div> */}

      {/* export button + progress: use the same content width by stretching to 100% */}
      <div style={{ marginTop: 6, width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={handleExport}
          disabled={!selectedDataset || exporting}
          className='btn'
          style={{
            width: '100%',            // <-- matches filename width
            alignSelf: 'stretch',     // ensure it stretches to the wrapper width
            padding: '12px 14px',
            borderRadius: 10
          }}
        >
          {exporting ? `Converting... ${exportProgress}%` : exportSuccess ? 'Export Complete!' : 'Convert & Download'}
        </button>

        {exporting && (
          <div style={{ marginTop: 0, width: '100%', boxSizing: 'border-box' }}>
            <div style={{ height: 8, background: '#eaeef0', borderRadius: 999 }}>
              <div style={{ height: 8, width: `${exportProgress}%`, background: '#0d9488', borderRadius: 999, transition: 'width .2s linear' }} />
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>Preparing your file — please wait</div>
          </div>
        )}

        {downloadError && <div style={{ marginTop: 0, color: '#b91c1c', fontSize: 13 }}>{downloadError}</div>}
        {/* {exportSuccess && !downloadError && <div style={{ marginTop: 12, color: '#065f46', fontSize: 13 }}>Export succeeded — check your downloads.</div>} */}
      </div>
    </div>
  </div>
  </div>
      </aside>
    </>
  );

  return ReactDOM.createPortal(panel, document.body);
}
