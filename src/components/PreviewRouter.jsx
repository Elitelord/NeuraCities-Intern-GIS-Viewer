import React from 'react';
import ShapefilePreview from './ShapefilePreview';
import GeoJsonPreview from './GeojsonPreview';
import CsvExcelPreview from './CsvExcelPreview';
import KmzPreview from './KmzPreview';

/**
 * PreviewRouter
 * - Renders ONLY the preview component. No outer boxes or headers.
 * - Keyed by dataset identity so the preview remounts & reparses when switching.
 */
export default function PreviewRouter({ dataset, onGeoJSONReady, onStyleChange }) {
  if (!dataset) return null;

  const emitFC = ({ label, geojson }) => {
    onGeoJSONReady?.({ label, geojson });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('geojson:ready', { detail: { label, geojson } }));
    }
  };

  const common = {
    files: dataset.files,
    onConvert: (fc) => {
      if (!fc || fc.type !== 'FeatureCollection') return;
      emitFC({ label: dataset.label, geojson: fc });
    }
  };

  const k = `${dataset.label}::${dataset.kind}`; // ⬅️ forces remount on change

  if (dataset.kind === 'geojson') {
    return (
      <GeoJsonPreview
        key={k}
        files={dataset.files}
        onConvert={(fc) => emitFC({ label: dataset.label, geojson: fc })}
        onStyleChange={onStyleChange}
      />
    );
  }
  switch (dataset.kind) {
    case 'shapefile':
      return <ShapefilePreview key={k} {...common} />;
    case 'csv':
    case 'excel':
      return <CsvExcelPreview key={k} {...common} />;
    case 'kmz':
      return <KmzPreview key={k} {...common} />;
    default:
      return null;
  }
}
