// ExportPanel.jsx
import React, { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import JSZip from 'jszip'; // if not already imported
import { csvToGeoJSON, kmzToGeoJSON} from './converters/fromFiles';
import { geojsonToCSV, geojsonToKMZ, geojsonToKML } from './converters/geojsonConverters';

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
    const map = { geojson: 'geojson', shapefile: 'zip', kml: 'kml', kmz: 'kmz', gpx: 'gpx', csv: 'csv', excel: 'xlsx', geotiff: 'tif', 'autocad-dxf': 'dxf', geopackage: 'gpkg', topojson: 'topojson', svg: 'svg', wkt: 'wkt' };
    return map[format] || 'zip';
  };

  // build the final filename using prefix + userFilename (sanitized) + extension
  const buildFilename = (ext) => {
    const middle = sanitizeFilename(userFilename) || sanitizeFilename(selectedDataset?.label || 'dataset');
    return `${FIXED_PREFIX}${middle}.${ext}`;
  };

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
        } else {
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
                const fc = await exportGeoJSON(selectedDataset); // fc returned, .geojson already downloaded
                console.log('[ExportPanel] exportGeoJSON produced fc with', fc?.features?.length, 'features');
              }
              else if (exportConfig.format === 'csv') {
                const filename = await exportCSV(selectedDataset);
                console.log('[ExportPanel] exportCSV returned filename:', filename);
              } else if (exportConfig.format === 'kml') {
                // generate KML text and download as .kml (no zip)
                try {
                  const fc = selectedDataset.type === 'FeatureCollection'
                    ? selectedDataset
                    : (selectedDataset.features ? { type: 'FeatureCollection', features: selectedDataset.features } : selectedDataset.geojson);
                  if (!fc) throw new Error('No GeoJSON available for KML export');
                  const { kmlText, filename: returnedName } = geojsonToKML(fc, { nameField: 'name' });
                  const filename = buildFilename(getFileExtension('kml'));
                  createAndDownload(filename, new Blob([kmlText], { type: 'application/vnd.google-earth.kml+xml' }));
                  console.log('[ExportPanel] KML exported:', filename);
                } catch (err) {
                  console.error('[ExportPanel] KML export failed', err);
                  setDownloadError('KML export failed');
                }
              } else if (exportConfig.format === 'kmz') {
                const filename = await Promise.resolve(exportKMZ(selectedDataset));
                console.log('[ExportPanel] exportKMZ returned filename:', filename);
              } else {
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
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 2147483600 }} onClick={onClose} aria-hidden="true" />
      <aside role="dialog" aria-modal="true" style={{ position: 'fixed', right: 0, top: 0, height: '100%', width: '100%', maxWidth: '520px', background: '#fff', zIndex: 2147483647, boxShadow: 'rgba(0,0,0,0.35) 0px 8px 40px', overflow: 'auto', pointerEvents: 'auto' }}>
        <div style={{ padding: 20, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Convert & Export</h2>
              <p style={{ marginTop: 6, color: '#6b7280' }}>Choose output format and settings</p>
            </div>
            <div>
              <button onClick={() => { onClose(); }} className = "btn" >Close</button>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Select Dataset to Export</label>
            <select value={datasets.indexOf(selectedDataset)} onChange={(e) => onSelectDataset(datasets[parseInt(e.target.value, 10)])} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #e5e7eb' }}>
              {datasets.map((d, i) => <option key={i} value={i}>{d.label} ({d.kind || 'unknown'}) - {d.size ? `${(d.size/1024).toFixed(1)} KB` : '—'}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Output Format</label>
              <select value={exportConfig.format} onChange={(e) => setExportConfig({ ...exportConfig, format: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                <optgroup label="Vector"><option value="geojson">GeoJSON (.geojson)</option><option value="shapefile">Shapefile (.zip)</option><option value="kml">KML (.kml)</option></optgroup>
                <optgroup label="Tabular"><option value="csv">CSV (.csv)</option><option value="excel">Excel (.xlsx)</option></optgroup>
                <optgroup label="Raster/CAD"><option value="geotiff">GeoTIFF (.tif)</option><option value="autocad-dxf">DXF (.dxf)</option></optgroup>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>CRS</label>
              <select value={exportConfig.crs} onChange={(e) => setExportConfig({ ...exportConfig, crs: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                <option value="EPSG:4326">WGS84 (EPSG:4326)</option>
                <option value="EPSG:3857">Web Mercator (EPSG:3857)</option>
                <option value="EPSG:32633">UTM 33N</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: 16, borderTop: '1px solid #eef2f7', paddingTop: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={exportConfig.includeMetadata} onChange={(e) => setExportConfig({ ...exportConfig, includeMetadata: e.target.checked })} />
              <span style={{ fontSize: 13 }}>Include metadata</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <input type="checkbox" checked={exportConfig.simplifyGeometry} onChange={(e) => setExportConfig({ ...exportConfig, simplifyGeometry: e.target.checked })} />
              <span style={{ fontSize: 13 }}>Simplify geometry</span>
            </label>
          </div>

          <div style={{ marginTop: 18 }}>
            <button onClick={handleExport} disabled={!selectedDataset || exporting} style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: 'none', background: exporting ? '#94d3ca' : '#0d9488', color: '#fff', fontWeight: 700 }}>
              {exporting ? `Converting... ${exportProgress}%` : exportSuccess ? 'Export Complete!' : 'Convert & Download'}
            </button>

            {exporting && <div style={{ marginTop: 12 }}><div style={{ height: 8, background: '#eaeef0', borderRadius: 999 }}><div style={{ height: 8, width: `${exportProgress}%`, background: '#0d9488', borderRadius: 999, transition: 'width .2s linear' }} /></div><div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>Preparing your file — please wait</div></div>}

            {downloadError && <div style={{ marginTop: 12, color: '#b91c1c', fontSize: 13 }}>{downloadError}</div>}
            {exportSuccess && !downloadError && <div style={{ marginTop: 12, color: '#065f46', fontSize: 13 }}>Export succeeded — check your downloads.</div>}
          </div>

          {/* filename editor: fixed prefix + editable middle + extension */}
          <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Filename</div>
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
              <span style={{ background: '#f3f4f6', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', color: '#374151', fontSize: 13 }}>{FIXED_PREFIX}</span>
              <input
                type="text"
                value={userFilename}
                onChange={(e) => setUserFilename(sanitizeFilename(e.target.value))}
                placeholder={sanitizeFilename(selectedDataset?.label || 'dataset')}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #e5e7eb', minWidth: 120 }}
                aria-label="Filename (without prefix or extension)"
              />
              <span style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fafafa', fontSize: 13 }}>.{getFileExtension(exportConfig.format)}</span>
            </div>

            <div style={{ width: '100%', fontSize: 12, color: '#6b7280' }}>
              Final filename will be: <strong>{FIXED_PREFIX}{sanitizeFilename(userFilename) || sanitizeFilename(selectedDataset?.label || 'dataset')}.{getFileExtension(exportConfig.format)}</strong>
            </div>
          </div>

          {/* view / manual download */}
          {lastBlobUrl && lastFilename && (
            <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
              <a href={lastBlobUrl} download={lastFilename} className='btn' style={{ display: 'inline-block', textDecoration: 'none' }}>
                Download
              </a>
              <button onClick={() => { revokeLastBlob(); setDownloadError(null); }} title="Clear generated file" className='btn'>Clear</button>
            </div>
          )}

          <div style={{ marginTop: 16, color: '#6b7280', fontSize: 12 }}>
            <div><strong>Dataset:</strong> {selectedDataset?.label || 'None selected'}</div>
            <div style={{ marginTop: 6 }}><strong>Format:</strong> {exportConfig.format.toUpperCase()}</div>
            <div style={{ marginTop: 6 }}><strong>CRS:</strong> {exportConfig.crs}</div>
          </div>

          <div style={{ marginTop: 18, fontSize: 11, color: '#6b7280' }}>
            <strong>Note:</strong> Client-side export supports GeoJSON and CSV. For shapefile/geopackage, integrate `shp-write` / `JSZip` or do server-side conversion.
          </div>
        </div>
      </aside>
    </>
  );

  return ReactDOM.createPortal(panel, document.body);
}
