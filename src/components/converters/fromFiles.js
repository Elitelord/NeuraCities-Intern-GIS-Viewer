// src/converters/fromFiles.js
import JSZip from 'jszip';
import * as toGeoJSON from '@tmcw/togeojson';
import Papa from 'papaparse';
import shp from 'shpjs';



// ----------------------
// Shapefile -> GeoJSON
// Accepts either:
//  - a .zip File containing .shp/.shx/.dbf etc.
//  - a single .shp/.dbf File (will be packaged into a zip client-side if needed)
// Returns: FeatureCollection { type: 'FeatureCollection', features: [...] , metadata: { name: ... } }
export async function shapefileToGeoJSON(fileOrFiles) {
  if (!fileOrFiles) throw new Error('No shapefile provided');

  // Accept either a single File object (zip or .shp), or an array-like of files (e.g. multiple parts uploaded)
  const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];

  // Helper to find if one of the files is a zip
  const zipFile = files.find(f => /\.zip$/i.test(f.name));
  if (zipFile) {
    const buffer = await zipFile.arrayBuffer();
    const geojson = await shp(buffer); // shpjs will parse zip ArrayBuffer -> GeoJSON
    const features = (geojson?.features || []).filter(f => f?.geometry?.coordinates);
    if (!features.length) throw new Error('No features found in shapefile ZIP');
    return { type: 'FeatureCollection', features, metadata: { name: zipFile.name.replace(/\.zip$/i, '') } };
  }

  // If user uploaded multiple component files (shp, dbf, shx) or a single shapefile part,
  // package them into a zip using JSZip and then parse with shpjs.
  const zip = new JSZip();
  // Add all provided files into the zip with their original names.
  for (const f of files) {
    // only add recognized shapefile-related extensions
    const name = f.name || `file_${Math.random().toString(36).slice(2,8)}`;
    zip.file(name, await f.arrayBuffer());
  }

  const zipped = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  const geojson = await shp(zipped);
  const features = (geojson?.features || []).filter(f => f?.geometry?.coordinates);
  if (!features.length) throw new Error('No features found in shapefile archive');
  // choose a base name from the first file
  const baseName = (files[0]?.name || 'shapefile').replace(/\.(shp|dbf|shx|prj|cpg|zip)$/i, '');
  return { type: 'FeatureCollection', features, metadata: { name: baseName } };
}

export async function gpxToGeoJSON(file) {
  if (!file) throw new Error('No GPX file provided');
  const text = await file.text();
  const dom = new DOMParser().parseFromString(text, 'application/xml');
  if (dom.documentElement.nodeName === 'parsererror') {
    throw new Error('Invalid GPX XML');
  }
  const fc = toGeoJSON.gpx(dom);
  const features = (fc?.features || []).filter(f => f?.geometry?.coordinates);
  if (!features.length) throw new Error('No features found in GPX');
  return {
    type: 'FeatureCollection',
    features,
    metadata: { name: file.name.replace(/\.gpx$/i, '') }
  };
}
/**
 * KMZ -> GeoJSON (FeatureCollection)
 * Accepts a File (KMZ) and returns a FeatureCollection object.
 */
export async function kmlToGeoJSON(file) {
  if (!file) throw new Error('No KML file provided');
  const text = await file.text();
  const dom = new DOMParser().parseFromString(text, 'application/xml');
  if (dom.documentElement.nodeName === 'parsererror') throw new Error('Invalid KML XML');

  const gj = toGeoJSON.kml(dom);

  // flatten GeometryCollection (from <MultiGeometry>) into separate features
  const out = [];
  for (const f of gj.features || []) {
    if (!f || !f.geometry) continue;

    if (f.geometry.type === 'GeometryCollection' && Array.isArray(f.geometry.geometries)) {
      for (const g of f.geometry.geometries) {
        if (!g) continue;
        out.push({ type: 'Feature', geometry: g, properties: { ...(f.properties || {}) } });
      }
      continue;
    }

    // keep normal geometries (Point/LineString/Polygon/Multi*)
    out.push(f);
  }

  if (!out.length) throw new Error('No features found in KML after normalization');
  return { type: 'FeatureCollection', features: out, metadata: { name: file.name.replace(/\.kml$/i, '') } };
}

// Replace your kmzToGeoJSON with this:
export async function kmzToGeoJSON(file) {
  if (!file) throw new Error('No KMZ file provided');
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  const kmlEntry = Object.values(zip.files).find(f =>
    f.name.toLowerCase().endsWith('.kml') && !f.name.startsWith('__MACOSX')
  );
  if (!kmlEntry) throw new Error('No KML file found in KMZ archive');

  const kmlText = await kmlEntry.async('text');
  const kmlDoc = new DOMParser().parseFromString(kmlText, 'application/xml');
  if (kmlDoc.documentElement.nodeName === 'parsererror') throw new Error('Invalid KML format in KMZ');

  const gj = toGeoJSON.kml(kmlDoc);

  // same flattening as KML
  const out = [];
  for (const f of gj.features || []) {
    if (!f || !f.geometry) continue;

    if (f.geometry.type === 'GeometryCollection' && Array.isArray(f.geometry.geometries)) {
      for (const g of f.geometry.geometries) {
        if (!g) continue;
        out.push({ type: 'Feature', geometry: g, properties: { ...(f.properties || {}) } });
      }
      continue;
    }

    out.push(f);
  }

  if (!out.length) throw new Error('No features found in KMZ after normalization');
  return { type: 'FeatureCollection', features: out, metadata: { name: file.name } };
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