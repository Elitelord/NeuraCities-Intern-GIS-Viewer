import React, { useEffect, useState, useCallback } from 'react';
import JSZip from 'jszip';
import * as toGeoJSON from '@tmcw/togeojson';

const KmzPreview = ({ files, onClose, onConvert }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [debugInfo, setDebugInfo] = useState('');

  // Convert KMZ -> KML -> GeoJSON and return FeatureCollection via onConvert
  const loadKmzAndConvert = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setDebugInfo('Loading KMZ file...');

    try {
      if (!files || files.length === 0) throw new Error('No file provided');

      const file = files[0];
      const buffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(buffer);

      // try to find a kml
      const kmlFile = Object.values(zip.files).find(f =>
        f.name.toLowerCase().endsWith('.kml') && !f.name.startsWith('__MACOSX')
      );

      if (!kmlFile) throw new Error('No KML file found in KMZ archive');

      const kmlText = await kmlFile.async('text');
      const parser = new DOMParser();
      const kmlDoc = parser.parseFromString(kmlText, 'application/xml');

      if (kmlDoc.documentElement.nodeName === 'parsererror') {
        throw new Error('Invalid KML format');
      }

      const geojson = toGeoJSON.kml(kmlDoc);
      if (!geojson || !Array.isArray(geojson.features) || geojson.features.length === 0) {
        throw new Error('No features found in KML conversion');
      }

      // Clean coordinates (existing logic preserved)
      const processedFeatures = [];
      geojson.features.forEach((feature, idx) => {
        try {
          if (feature.geometry && feature.geometry.coordinates) {
            const cleanCoords = (coords) => {
              if (!coords) return null;
              if (typeof coords[0] === 'number') {
                if (coords.length >= 2) {
                  const [lng, lat] = coords;
                  if (!isNaN(lng) && !isNaN(lat) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
                    return [lng, lat];
                  }
                }
                return null;
              }
              // nested
              const c = coords.map(cleanCoords).filter(Boolean);
              return c.length ? c : null;
            };

            const cleaned = cleanCoords(feature.geometry.coordinates);
            if (cleaned) {
              feature.geometry.coordinates = cleaned;
              processedFeatures.push(feature);
            } else {
              console.warn(`[KMZ] Skipping feature ${idx}: invalid coordinates`);
            }
          }
        } catch (e) {
          console.warn(`[KMZ] Error processing feature ${idx}:`, e);
        }
      });

      if (processedFeatures.length === 0) throw new Error('No valid features after processing');

      const fc = { type: 'FeatureCollection', features: processedFeatures };

      // expose for debugging
      try { window.__DEBUG_LAST_GEOJSON__ = fc; } catch (e) {}

      setDebugInfo(`Converted ${processedFeatures.length} features.`);
      if (typeof onConvert === 'function') onConvert(fc);

      setIsLoading(false);
      return fc;
    } catch (err) {
      console.error('[KMZ] Error:', err);
      setError(err.message || 'Failed to load KMZ file');
      setDebugInfo('');
      setIsLoading(false);
    }
  }, [files, onConvert]);

  useEffect(() => {
    loadKmzAndConvert();
    // intentionally no cleanup map logic since we don't create maps here
  }, [loadKmzAndConvert]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-48 p-4">
        <p className="text-red-600 font-semibold">Error</p>
        <p className="text-sm text-red-500">{error}</p>
        {onClose && <button onClick={onClose} className="mt-3 px-3 py-1 bg-gray-200 rounded">Close</button>}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 p-4">
        <div>
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-gray-600">Converting KMZ → GeoJSON…</p>
          {debugInfo && <p className="text-xs text-gray-500 mt-2">{debugInfo}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="text-sm text-green-700 font-medium">{debugInfo || 'Conversion complete'}</div>
      <div className="mt-3 flex gap-2">
        {typeof onConvert === 'function' && (
          <button
            onClick={() => { if (typeof onConvert === 'function') onConvert(window.__DEBUG_LAST_GEOJSON__); }}
            className="px-3 py-1 bg-blue-600 text-white rounded"
          >
            Open in GeoJSON Preview
          </button>
        )}
        {onClose && (
          <button onClick={onClose} className="px-3 py-1 bg-gray-200 rounded">Close</button>
        )}
      </div>
    </div>
  );
};

export default KmzPreview;
