import React, { useEffect, useState } from 'react';
import ShapefilePreview from './ShapefilePreview';
import GeoJsonPreview from './GeojsonPreview';
import CsvExcelPreview from './CsvExcelPreview';
import KmzPreview from './KmzPreview';
import { kmzToGeoJSON, csvToGeoJSON } from './converters/fromFiles'; // path may vary

/**
 * PreviewRouter
 * - Centralized conversion for CSV / KMZ -> GeoJSON using shared converters.
 * - Emits converted FeatureCollection via onGeoJSONReady.
 * - Renders GeoJsonPreview for converted content (passes a Blob/File).
 * - Falls back to original per-format preview components for formats not converted here.
 */
export default function PreviewRouter({ dataset, onGeoJSONReady, onStyleChange }) {
  const [readyFile, setReadyFile] = useState(null); // Blob/File to feed GeoJsonPreview
  const [status, setStatus] = useState('idle'); // 'idle' | 'prepping' | 'error'
  const [error, setError] = useState(null);

  const emitFC = ({ label, geojson }) => {
    onGeoJSONReady?.({ label, geojson });
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('geojson:ready', { detail: { label, geojson } }));
      } catch (e) {
        // ignore envs that don't allow CustomEvent
      }
    }
  };

  useEffect(() => {
    let mounted = true;
    setReadyFile(null);
    setError(null);
    setStatus('idle');

    if (!dataset) return;

    const keyFile = dataset.files && dataset.files[0];

    const prepareFromGeoJSON = (fc) => {
      // create a blob/file for GeoJsonPreview (it expects files prop)
      const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' });
      try { blob.name = `${(dataset.label || 'converted').replace(/\s+/g, '_')}.geojson`; } catch (e) {}
      if (!mounted) return;
      setReadyFile(blob);
      emitFC({ label: dataset.label, geojson: fc });
      setStatus('idle');
    };

    const run = async () => {
      setStatus('prepping');

      try {
        // If dataset already contains geojson, use it
        if (dataset.geojson && dataset.geojson.type === 'FeatureCollection') {
          prepareFromGeoJSON(dataset.geojson);
          return;
        }

        // If raw file is already GeoJSON file, pass it straight through
        if (keyFile && keyFile.name && keyFile.name.toLowerCase().endsWith('.geojson')) {
          if (!mounted) return;
          setReadyFile(keyFile);
          // Optionally attempt to parse and emit (we won't parse here to avoid duplication)
          setStatus('idle');
          return;
        }

        // KMZ -> GeoJSON conversion
        if (dataset.kind === 'kmz' && keyFile) {
          try {
            const fc = await kmzToGeoJSON(keyFile);
            if (!mounted) return;
            prepareFromGeoJSON(fc);
            return;
          } catch (err) {
            console.error('[PreviewRouter] kmzToGeoJSON failed', err);
            if (!mounted) return;
            setError('KMZ → GeoJSON conversion failed: ' + (err.message || String(err)));
            setStatus('error');
            return;
          }
        }

        // CSV/Excel -> GeoJSON conversion (CSV primary)
        if ((dataset.kind === 'csv' || dataset.kind === 'excel') && keyFile) {
          try {
            // Prefer csvToGeoJSON for .csv files; for excel you might keep CsvExcelPreview
            if (keyFile.name && keyFile.name.toLowerCase().endsWith('.csv')) {
              const fc = await csvToGeoJSON(keyFile);
              if (!mounted) return;
              if (!fc || !Array.isArray(fc.features) || fc.features.length === 0) {
                setError('CSV conversion produced no mappable features (no coordinate columns).');
                setStatus('error');
                return;
              }
              prepareFromGeoJSON(fc);
              return;
            } else {
              // For .xlsx/.xls, fallback to CsvExcelPreview which handles sheet selection
              // So render CsvExcelPreview below (no conversion here)
              setStatus('idle');
              setReadyFile(null);
              return;
            }
          } catch (err) {
            console.error('[PreviewRouter] csvToGeoJSON failed', err);
            if (!mounted) return;
            setError('CSV → GeoJSON conversion failed: ' + (err.message || String(err)));
            setStatus('error');
            return;
          }
        }

        // If we reach here, defer to existing per-format preview components
        setStatus('idle');
        setReadyFile(null);
      } catch (err) {
        console.error('[PreviewRouter] prepare error', err);
        if (!mounted) return;
        setError(err?.message || String(err));
        setStatus('error');
      }
    };

    run();

    return () => {
      mounted = false;
    };
  }, [dataset]);

  // Force remount key so previews re-run parsing when dataset changes
  const k = `${dataset?.label || 'dataset'}::${dataset?.kind || 'unknown'}`;

  if (!dataset) return null;

  // Error state
  if (status === 'error') {
    return (
      <div style={{ padding: 14 }}>
        <div style={{ color: '#b91c1c', fontWeight: 700 }}>Could not prepare preview</div>
        <div style={{ color: '#374151' }}>{error}</div>
      </div>
    );
  }

  // Preparing state
  if (status === 'prepping') {
    return <div style={{ padding: 14 }}>Preparing preview…</div>;
  }

  // If we have a readyFile (converted GeoJSON Blob/File), render GeoJsonPreview
  if (readyFile) {
    return (
      <GeoJsonPreview
        key={k}
        files={[readyFile]}
        onConvert={(fc) => emitFC({ label: dataset.label, geojson: fc })}
        onStyleChange={onStyleChange}
      />
    );
  }

  // Fallbacks: use original preview components for formats we didn't convert here
  switch (dataset.kind) {
    case 'shapefile':
      return <ShapefilePreview key={k} files={dataset.files} onConvert={(fc) => emitFC({ label: dataset.label, geojson: fc })} />;
    case 'excel':
      return <CsvExcelPreview key={k} files={dataset.files} onConvert={(fc) => emitFC({ label: dataset.label, geojson: fc })} />;
    case 'csv':
      // For CSV we attempted conversion above for .csv files; if we reach here, use CsvExcelPreview as fallback
      return <CsvExcelPreview key={k} files={dataset.files} onConvert={(fc) => emitFC({ label: dataset.label, geojson: fc })} />;
    case 'kmz':
      // For KMZ we attempted conversion above; fallback to KmzPreview if conversion didn't run
      return <KmzPreview key={k} files={dataset.files} onConvert={(fc) => emitFC({ label: dataset.label, geojson: fc })} />;
    case 'geojson':
      return (
        <GeoJsonPreview
          key={k}
          files={dataset.files}
          onConvert={(fc) => emitFC({ label: dataset.label, geojson: fc })}
          onStyleChange={onStyleChange}
        />
      );
    default:
      // unknown kinds -> try GeoJsonPreview directly (it will error gracefully)
      return <GeoJsonPreview key={k} files={dataset.files} onConvert={(fc) => emitFC({ label: dataset.label, geojson: fc })} onStyleChange={onStyleChange} />;
  }
}
