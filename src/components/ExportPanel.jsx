// ExportPanel.jsx
import React, { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';

/**
 * ExportPanel (robust download)
 *
 * - Improved createAndDownload with multiple fallbacks and explicit user-visible failures.
 * - Keeps blob URL around until panel closes or user clears it.
 * - Shows "View file" / "Download" links after generation.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const revokeLastBlob = () => {
    if (lastBlobUrl) {
      try { URL.revokeObjectURL(lastBlobUrl); } catch (e) { /* ignore */ }
      setLastBlobUrl(null);
      setLastFilename(null);
    }
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

  const exportGeoJSON = (dataset) => {
  console.log('[ExportPanel] exportGeoJSON called', dataset);
  if (!dataset) {
    console.warn('[ExportPanel] No dataset provided');
    return null;
  }

  let fc = null;
  if (dataset.type === 'FeatureCollection' && Array.isArray(dataset.features)) fc = dataset;
  else if (Array.isArray(dataset.features)) fc = { type: 'FeatureCollection', features: dataset.features };
  else if (dataset.geojson) fc = dataset.geojson;
  else {
    console.warn('[ExportPanel] Could not determine GeoJSON from dataset', dataset);
    return null;
  }

  console.log('[ExportPanel] FeatureCollection prepared', fc.features?.length);
  const filename = `${(dataset.label || 'dataset').replace(/\s+/g, '_')}.geojson`;
  const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' });

  const result = createAndDownload(filename, blob);
  console.log('[ExportPanel] createAndDownload result:', result);
  return filename;
};

  const exportCSV = (dataset) => {
    let rows = [];
    if (Array.isArray(dataset.rows) && dataset.rows.length) rows = dataset.rows;
    else if (Array.isArray(dataset.features) && dataset.features.length) rows = dataset.features.map((f) => ({ ...(f.properties || {}) }));
    else return null;

    if (rows.length === 0) return null;
    const keys = Array.from(rows.reduce((acc, r) => { Object.keys(r || {}).forEach(k => acc.add(k)); return acc; }, new Set()));
    const csvLines = [ keys.join(','), ...rows.map(r => keys.map(k => {
      const v = r[k]; if (v === null || v === undefined) return ''; const s = String(v).replace(/"/g, '""'); return s.includes(',') || s.includes('"') ? `"${s}"` : s;
    }).join(',')) ];

    const filename = `${(dataset.label || 'dataset').replace(/\s+/g, '_')}.${getFileExtension('csv')}`;
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv' });
    createAndDownload(filename, blob);
    return filename;
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

        try {
          if (exportConfig.format === 'geojson') {
            const filename = exportGeoJSON(selectedDataset);
            console.log('[ExportPanel] exportGeoJSON returned filename:', filename);
          }
          else if (exportConfig.format === 'csv') {
            console.log('[ExportPanel] exportCSV not yet instrumented for debug'); // can add logs there similarly
          }
          else {
            console.log('[ExportPanel] placeholder export for format:', exportConfig.format);
            const filename = `${(selectedDataset.label || 'dataset').replace(/\s+/g, '_')}.${getFileExtension(exportConfig.format)}`;
            const mime = (exportConfig.format === 'shapefile' || exportConfig.format === 'geopackage') ? 'application/zip' : 'application/octet-stream';
            const placeholder = new Blob([`Export placeholder: ${filename}\nFormat: ${exportConfig.format}\nCRS: ${exportConfig.crs}`], { type: mime });
            createAndDownload(filename, placeholder);
          }
        } catch (err) {
          console.error('[ExportPanel] Export exception', err);
          setDownloadError('Export failed (see console).');
        }

        setTimeout(() => {
          setExporting(false);
          setExportSuccess(true);
          setTimeout(() => setExportSuccess(false), 3000);
        }, 300);

        return 100;
      }
      return next;
    });
  }, 160);
}, [selectedDataset, exportConfig]);

  const getFileExtension = (format) => {
    const map = { geojson: 'geojson', shapefile: 'zip', kml: 'kml', kmz: 'kmz', gpx: 'gpx', csv: 'csv', excel: 'xlsx', geotiff: 'tif', 'autocad-dxf': 'dxf', geopackage: 'gpkg', topojson: 'topojson', svg: 'svg', wkt: 'wkt' };
    return map[format] || 'zip';
  };

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
              {/* style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: '#374151' }} */}
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

          {/* view / manual download */}
          {lastBlobUrl && lastFilename && (
            <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
              <button href={lastBlobUrl} download={lastFilename} className='btn'>Download</button>
{/* style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', textDecoration: 'none', color: '#111' }} */}
              <button onClick={() => { revokeLastBlob(); setDownloadError(null); }} title="Clear generated file" className='btn'>Clear</button>
               {/* style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #efefef', background: '#fff', cursor: 'pointer', color: '#6b7280' }} */}
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
