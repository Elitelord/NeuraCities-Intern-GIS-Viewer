import React from 'react';
import ShapefilePreview from './ShapefilePreview';
import GeoJsonPreview from './GeojsonPreview';
import CsvExcelPreview from './CsvExcelPreview';
import KmzPreview from './KmzPreview';

/**
 * PreviewRouter
 * - Forces remount per dataset via `key`
 * - Returns parsed FC tagged with the dataset's stable id so the parent
 *   stores it under the correct bucket even if the user switches quickly.
 */
export default function PreviewRouter({ dataset, onGeoJSONReady, onStyleChange }) {
  if (!dataset) return null;

  const datasetId = dataset._id;                  // stable id assigned by parent
  const k = datasetId;                            // force remount when dataset changes

  const emitFC = (geojson) => {
    onGeoJSONReady?.({ datasetId, geojson });
    // Still broadcast for backward compatibility (MapWorkspace ignores it when parent props are used)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('geojson:ready', {
        detail: { label: dataset.label, geojson }
      }));
    }
  };

  const common = {
    files: dataset.files,
    onConvert: (fc) => {
      if (fc && fc.type === 'FeatureCollection') emitFC(fc);
    },
    onStyleChange,
  };

  if (dataset.kind === 'geojson') {
    return <GeoJsonPreview key={k} {...common} />;
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
