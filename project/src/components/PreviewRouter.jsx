import React from 'react';
import ShapefilePreview from '../pages/ShapefilePreview';
import GeoJsonPreview from '../pages/GeojsonPreview';
import CsvExcelPreview from '../pages/CsvExcelPreview';

export default function PreviewRouter({ dataset, onClose }) {
  if (!dataset) return null;

  switch (dataset.kind) {
    case 'shapefile':
      return <ShapefilePreview files={dataset.files} onClose={onClose} />;
    case 'geojson':
      return <GeoJsonPreview files={dataset.files} onClose={onClose} />;
    case 'csv':
    case 'excel':
      return <CsvExcelPreview files={dataset.files} onClose={onClose} />;
    default:
      return (
        <div className="unsupported">
          <div className="unsupported-title">Unsupported file (yet)</div>
          <div className="unsupported-desc">
            We detected “{dataset.label}” but don’t have a previewer for this format.
          </div>
        </div>
      );
  }
}
