// src/converters/fromFiles.js
import JSZip from 'jszip';
import * as toGeoJSON from '@tmcw/togeojson';
import Papa from 'papaparse';

/**
 * KMZ -> GeoJSON (FeatureCollection)
 * Accepts a File (KMZ) and returns a FeatureCollection object.
 */
export async function kmzToGeoJSON(file) {
  if (!file) throw new Error('No KMZ file provided');
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  // Find a .kml file inside the KMZ
  const kmlFile = Object.values(zip.files).find(f =>
    f.name.toLowerCase().endsWith('.kml') && !f.name.startsWith('__MACOSX')
  );
  if (!kmlFile) throw new Error('No KML file found in KMZ archive');

  const kmlText = await kmlFile.async('text');
  const parser = new DOMParser();
  const kmlDoc = parser.parseFromString(kmlText, 'application/xml');
  if (kmlDoc.documentElement.nodeName === 'parsererror') {
    throw new Error('Invalid KML format in KMZ');
  }

  const geojson = toGeoJSON.kml(kmlDoc);
  const features = (geojson.features || []).filter(f => f && f.geometry && f.geometry.coordinates);
  return { type: 'FeatureCollection', features, metadata: { name: file.name } };
}

/**
 * CSV -> GeoJSON (FeatureCollection)
 * Heuristic coordinate detection + WKT / combined support.
 * Accepts a File (CSV) and returns a FeatureCollection.
 */
export async function csvToGeoJSON(file) {
  if (!file) throw new Error('No CSV file provided');

  const results = await new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      delimitersToGuess: [',', '\t', '|', ';'],
      complete: resolve,
      error: reject
    });
  });

  const rows = results.data || [];
  if (!rows.length) return { type: 'FeatureCollection', features: [] };

  // Detect coordinate columns (simple variant of your detectCoordinateColumns)
  const headers = Object.keys(rows[0]).map(h => h.trim());
  const headerLower = headers.map(h => h.toLowerCase());
  const latCandidates = ['latitude','lat','y','y_coord','lat_dd'];
  const lngCandidates = ['longitude','lon','lng','x','x_coord','long','lng_dd'];
  const combinedCandidates = ['location','coordinates','wkt','geom','the_geom','point','latlng','latlon'];

  let latCol = null, lngCol = null, combinedCol = null;
  headerLower.forEach((h, i) => {
    if (!latCol && latCandidates.includes(h)) latCol = headers[i];
    if (!lngCol && lngCandidates.includes(h)) lngCol = headers[i];
    if (!combinedCol && combinedCandidates.includes(h)) combinedCol = headers[i];
  });

  // Helper: parse combined coordinate strings (very similar to your parseCombinedCoordinates)
  const parseCombinedCoordinates = (coordString) => {
    if (!coordString || typeof coordString !== 'string') return null;
    // Try WKT POINT
    const pointMatch = coordString.match(/POINT\s*\(\s*([+-]?\d*\.?\d+)[ ,]\s*([+-]?\d*\.?\d+)\s*\)/i);
    if (pointMatch) return { lng: parseFloat(pointMatch[1]), lat: parseFloat(pointMatch[2]) };
    // comma separated
    let m = coordString.match(/([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)/);
    if (m) {
      const a = parseFloat(m[1]), b = parseFloat(m[2]);
      if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lng: b };
      if (Math.abs(b) <= 90 && Math.abs(a) <= 180) return { lat: b, lng: a };
      return { lng: a, lat: b };
    }
    // space separated
    m = coordString.match(/([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)/);
    if (m) {
      const a = parseFloat(m[1]), b = parseFloat(m[2]);
      if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lng: b };
      if (Math.abs(b) <= 90 && Math.abs(a) <= 180) return { lat: b, lng: a };
      return { lng: a, lat: b };
    }
    return null;
  };

  const features = [];
  for (const row of rows) {
    try {
      if (combinedCol && row[combinedCol]) {
        const parsed = parseCombinedCoordinates(String(row[combinedCol]));
        if (parsed) {
          features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [parsed.lng, parsed.lat] }, properties: row });
        }
        continue;
      }
      if (latCol && lngCol && row[latCol] != null && row[lngCol] != null) {
        const lat = parseFloat(row[latCol]), lng = parseFloat(row[lngCol]);
        if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
          features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: row });
        }
        continue;
      }
      // no coords, skip
    } catch (e) {
      // ignore row errors
    }
  }

  return { type: 'FeatureCollection', features, metadata: { name: file.name } };
}