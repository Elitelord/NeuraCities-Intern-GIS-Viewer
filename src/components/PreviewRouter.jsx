import React, { useEffect, useState } from 'react';
import ShapefilePreview from './ShapefilePreview';
import GeoJsonPreview from './GeojsonPreview';
import CsvExcelPreview from './CsvExcelPreview';
import KmzPreview from './KmzPreview';

export default function PreviewRouter({ dataset, onClose }) {
  // file-like object that GeoJsonPreview expects in its `files` prop
  const [convertedFile, setConvertedFile] = useState(null);
  const [sourceKind, setSourceKind] = useState(null);
  const [isConverting, setIsConverting] = useState(false);
  const [convertError, setConvertError] = useState(null);

  useEffect(() => {
    // Reset whenever dataset changes
    setConvertedFile(null);
    setSourceKind(dataset?.kind || null);
    setIsConverting(false);
    setConvertError(null);
  }, [dataset]);

  if (!dataset) return null;

  // Helper: receive a FeatureCollection object and convert into a File for GeoJsonPreview
  const handleConvert = async (featureCollection) => {
    try {
      setIsConverting(true);
      setConvertError(null);

      if (!featureCollection || featureCollection.type !== 'FeatureCollection') {
        throw new Error('Converter returned invalid GeoJSON FeatureCollection');
      }

      const json = JSON.stringify(featureCollection, null, 2);
      // Create a File so GeoJsonPreview can read .text() like a normal uploaded file
      const blob = new Blob([json], { type: 'application/geo+json' });
      // Some environments (browsers) support the File constructor; fallback to blob if not
      let file;
      try {
        file = new File([blob], 'converted.geojson', { type: 'application/geo+json' });
      } catch (e) {
        // older browsers: attach name to blob-like object
        file = blob;
        file.name = 'converted.geojson';
      }

      setConvertedFile(file);
    } catch (err) {
      console.error('PreviewRouter: conversion failed', err);
      setConvertError(err?.message || String(err));
    } finally {
      setIsConverting(false);
    }
  };

  // Back to converter (clears converted file)
  const handleBackToConverter = () => {
    setConvertedFile(null);
    setConvertError(null);
    setIsConverting(false);
  };

  // If dataset is already geojson, show GeoJsonPreview directly
  if (dataset.kind === 'geojson') {
    return <GeoJsonPreview files={dataset.files} onClose={onClose} />;
  }

  // If we have a converted geojson, show the GeoJsonPreview with that file
  if (convertedFile) {
    const filesForGeojson = [convertedFile];
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <GeoJsonPreview files={filesForGeojson} onClose={onClose} />
      </div>
    );
  }

  // If conversion in progress or error, show a small status UI and still render the converter
  const converterCommonProps = {
    files: dataset.files,
    onClose
  };

  // Render the appropriate converter preview and pass onConvert to receive FeatureCollection
  switch (dataset.kind) {
    case 'shapefile':
      return (
        <div>
          {isConverting && <div style={{ padding: 8, color: '#0ea5a4' }}>Converting…</div>}
          {convertError && <div style={{ padding: 8, color: '#dc2626' }}>Conversion error: {convertError}</div>}
          <ShapefilePreview {...converterCommonProps} onConvert={handleConvert} />
        </div>
      );

    case 'csv':
    case 'excel':
      return (
        <div>
          {isConverting && <div style={{ padding: 8, color: '#0ea5a4' }}>Converting…</div>}
          {convertError && <div style={{ padding: 8, color: '#dc2626' }}>Conversion error: {convertError}</div>}
          <CsvExcelPreview {...converterCommonProps} onConvert={handleConvert} />
        </div>
      );

    case 'kmz':
      return (
        <div>
          {isConverting && <div style={{ padding: 8, color: '#0ea5a4' }}>Converting…</div>}
          {convertError && <div style={{ padding: 8, color: '#dc2626' }}>Conversion error: {convertError}</div>}
          <KmzPreview {...converterCommonProps} onConvert={handleConvert} />
        </div>
      );

    default:
      return (
        <div className="unsupported" style={{ padding: 20 }}>
          <div className="unsupported-title" style={{ fontWeight: 700, marginBottom: 6 }}>Unsupported file (yet)</div>
          <div className="unsupported-desc">
            We detected “{dataset.label}” but don’t have a previewer for this format.
          </div>
        </div>
      );
  }
}
