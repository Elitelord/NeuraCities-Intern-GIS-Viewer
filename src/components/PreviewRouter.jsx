import React, { useEffect, useState } from 'react';
import ShapefilePreview from './ShapefilePreview';
import GeoJsonPreview from './GeojsonPreview';
import CsvExcelPreview from './CsvExcelPreview';
import KmzPreview from './KmzPreview';

// ✅ Use shared converters so XML types aren't JSON.parsed by mistake
import {
  kmlToGeoJSON,
  kmzToGeoJSON,
  gpxToGeoJSON,
  csvToGeoJSON,
  shapefileToGeoJSON,
  // (you can import shapefileToGeoJSON if you ever want to convert in-router)
} from './converters/fromFiles';

// <-- NEW imports for raster support -->
import { geotiffToRaster } from './converters/rasterConverters';
import RasterPreview from './rasterPreview';

/**
 * PreviewRouter
 * - Centralized conversion to GeoJSON for CSV / KML / KMZ / GPX using shared converters.
 * - Emits converted FeatureCollection via onGeoJSONReady.
 * - Renders GeoJsonPreview for converted content (passes a Blob/File).
 * - Falls back to original per-format preview components where that UX is better (e.g., shapefile, Excel).
 *
 * New: accepts optional `map` prop (Leaflet map instance). If provided, it will be forwarded
 * to RasterPreview; otherwise RasterPreview will use window.map as a fallback.
 */
export default function PreviewRouter({ dataset, onGeoJSONReady, onStyleChange, map }) {
  const [readyFile, setReadyFile] = useState(null);     // Blob/File for GeoJsonPreview
  const [status, setStatus] = useState('idle');         // 'idle' | 'prepping' | 'error'
  const [error, setError] = useState(null);
  const [shapefileAttempted, setShapefileAttempted] = useState(false);

  // <-- NEW state to hold raster preview dataset -->
  const [rasterDataset, setRasterDataset] = useState(null);

  if (!dataset) return null;
  const datasetId = dataset._id || dataset.id || dataset.uid || dataset.label || null;


  const emitFC = ({ label, geojson }) => {
    onGeoJSONReady?.({ datasetId, label, geojson });
    try {
      window.__GEOJSON_CACHE__ = window.__GEOJSON_CACHE__ || {};
      if (label) window.__GEOJSON_CACHE__[label] = geojson;
    } catch {}
    try {
      window.dispatchEvent(new CustomEvent('geojson:ready', { detail: { label, geojson } }));
    } catch {}
  };
  
  // Helper: wrap a FeatureCollection as a File-like Blob for GeoJsonPreview
  const toGeoJSONBlob = (fc, name) => {
    const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' });
    try { blob.name = `${(name || 'converted').replace(/\s+/g, '_')}.geojson`; } catch {}
    return blob;
  };

  useEffect(() => {
    let mounted = true;

    // Clear states on dataset change
    setReadyFile(null);
    setRasterDataset(null);
    setError(null);
    setStatus('idle');
    setShapefileAttempted(false);

    if (!dataset) return;

    const keyFile = dataset.files?.[0];
    const label = dataset.label || (keyFile?.name ?? 'dataset');

    const prepareFromGeoJSON = (fc) => {
      if (!mounted) return;
      const blob = toGeoJSONBlob(fc, label);

      setReadyFile(blob);

      emitFC({ label, geojson: fc });
      setStatus('idle');
    };

    const run = async () => {
      setStatus('prepping');
      try {
        // 0) Already have a FC attached by a preview
        if (dataset.geojson?.type === 'FeatureCollection') {
          prepareFromGeoJSON(dataset.geojson);
          return;
        }

        // ---------- NEW: Detect TIFF/GeoTIFF and create rasterDataset ----------
        // Accept either dataset.kind indicating raster, or file extension on keyFile
        const name = keyFile?.name?.toLowerCase?.() || '';
        const looksLikeTiff = /\.(tif|tiff)$/i.test(name) || /(tif|tiff|geotiff|raster)/i.test(dataset.kind || '');
        if (looksLikeTiff && keyFile) {
          try {
            const rd = await geotiffToRaster(keyFile);
            if (!mounted) return;
            // rd should be { kind: 'raster', metadata, previewBlob, rawBlob }
            setRasterDataset(rd);
            setStatus('idle');
            return; // raster path ends here (no GeoJSON produced)
          } catch (err) {
            // If geotiff parsing fails, fall back to other behavior below (e.g., show generic message)
            console.error('[PreviewRouter] geotiff parse error', err);
            // continue to other handlers / fallbacks
          }
        }

        // 1) Pass-through raw GeoJSON/JSON file (let GeoJsonPreview parse/validate)
        if (keyFile && /\.(geojson|json)$/i.test(keyFile.name)) {
          if (!mounted) return;
          setReadyFile(keyFile);
          setStatus('idle');
          return;
        }

        // 2) CSV → GeoJSON (auto-convert)
        if (dataset.kind === 'csv' && keyFile) {
          const fc = await csvToGeoJSON(keyFile);
          if (!fc?.features?.length) throw new Error('CSV produced no mappable features (need lat/lon or geometry).');
          prepareFromGeoJSON(fc);
          return;
        }

        // 3) Excel → use Excel preview (sheet selection, etc.)
        if (dataset.kind === 'excel') {
          setStatus('idle');
          return; // handled in switch() fallback
        }

        // 4) KML → GeoJSON (XML via togeojson)
        if (dataset.kind === 'kml' && keyFile) {
          const fc = await kmlToGeoJSON(keyFile);
          prepareFromGeoJSON(fc);
          return;
        }

        // 5) KMZ → GeoJSON (zip of KML via togeojson)
        if (dataset.kind === 'kmz' && keyFile) {
          const fc = await kmzToGeoJSON(keyFile);
          prepareFromGeoJSON(fc);
          return;
        }

        // 6) GPX → GeoJSON
        if (dataset.kind === 'gpx' && keyFile) {
          console.log(keyFile);
          const fc = await gpxToGeoJSON(keyFile);
          prepareFromGeoJSON(fc);
          return;
        }

        // 7) Shapefile -> keep dedicated preview (progress, messages)
        if ((dataset.kind === 'shapefile' || dataset.kind === 'zip') && keyFile) {
          // mark that we attempted conversion (so fallback won't mount until this finished)
          setShapefileAttempted(true);

          try {
            const fc = await shapefileToGeoJSON(dataset.files);
            prepareFromGeoJSON(fc);
            return;
          } catch (err) {
            console.error('[Shapefile] parse error', err);
            if (mounted) setStatus('idle');
            // and then return so we don't continue with the rest of run()
            return;
          }
        }

        // 8) Unknown or other kinds → let fallbacks handle
        setStatus('idle');
      } catch (err) {
        console.error('[PreviewRouter] prepare error', err);
        if (!mounted) return;
        setError(err?.message || String(err));
        setStatus('error');
      }
    };

    run();
    return () => { mounted = false; };
  }, [dataset, map]);

  // Re-mount previews when dataset identity/kind changes
  const k = `${dataset?.label || 'dataset'}::${dataset?.kind || 'unknown'}`;

  if (status === 'error') {
    return (
      <div style={{ padding: 14 }}>
        <div style={{ color: '#b91c1c', fontWeight: 700, marginBottom: 6 }}>Could not prepare preview</div>
        <div style={{ color: '#374151' }}>{error}</div>
      </div>
    );
  }

  if (status === 'prepping') {
    return <div style={{ padding: 14 }}>Preparing preview…</div>;
  }

  // ---------- NEW: If we produced a rasterDataset, show RasterPreview (pass map prop) ----------
  if (rasterDataset) {
    return (
      <RasterPreview
        key={k}
        dataset={rasterDataset}
        map={map || (typeof window !== 'undefined' ? window.map : null)}
        // optional props: allow RasterPreview to emit events or offer server upload
        // onExport={(opts) => ... }
      />
    );
  }

  // If we produced a GeoJSON blob/file, show the unified GeoJSON preview
  if (readyFile) {
    return (
      <GeoJsonPreview
        key={k}
        files={[readyFile]}
        onConvert={(fc) => emitFC({ label: dataset.label, geojson: fc })}
        onStyleChange={onStyleChange}
        hideInlineUI
      />
    );
  }

  // Fallbacks (formats we didn't convert here or want dedicated UX for)
  switch (dataset.kind) {
    case 'excel':
      return (
        <CsvExcelPreview
          key={k}
          files={dataset.files}
          onConvert={(fc) => emitFC({ label: dataset.label, geojson: fc })}
        />
      );

    case 'csv':
      // If we’re here, conversion didn’t run (non-.csv or special case) — use CSV/Excel preview
      return (
        <CsvExcelPreview
          key={k}
          files={dataset.files}
          onConvert={(fc) => emitFC({ label: dataset.label, geojson: fc })}
        />
      );

    case 'kmz':
      // Usually handled above; keep a fallback (nice to have)
      return (
        <KmzPreview
          key={k}
          files={dataset.files}
          onConvert={(fc) => emitFC({ label: dataset.label, geojson: fc })}
        />
      );

    case 'geojson':
      return (
        <GeoJsonPreview
          key={k}
          files={dataset.files}
          onConvert={(fc) => emitFC({ label: dataset.label, geojson: fc })}
          onStyleChange={onStyleChange}
        />
      );

    // KML/GPX should have been converted above; if they fall through, show a friendly message
    case 'kml':
    case 'gpx':
      return (
        <div style={{ padding: 14 }}>
          Unable to prepare preview for {dataset.kind.toUpperCase()}.
          Please re-add the file; if the issue persists, check the console for details.
        </div>
      );

    default:
      // Unknown kinds → try GeoJSON preview (it fails gracefully with a message)
      return (
        <GeoJsonPreview
          key={k}
          files={dataset.files}
          onConvert={(fc) => emitFC({ label: dataset.label, geojson: fc })}
          onStyleChange={onStyleChange}
        />
      );
  }
}
