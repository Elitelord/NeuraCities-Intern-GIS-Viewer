import React, { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

const CsvExcelPreview = ({ files, onClose, onConvert }) => {
  const hasLoadedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState('');
  const [isExcelFile, setIsExcelFile] = useState(false);
  const [sheetNames, setSheetNames] = useState([]);
  const [activeSheet, setActiveSheet] = useState('');

  const extractCoordinatesFromPolygon = (coordString) => {
    const coords = [];
    const matches = coordString.match(/([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)/g);
    if (matches) {
      matches.forEach(match => {
        const parts = match.trim().split(/\s+/);
        if (parts.length >= 2) {
          const lng = parseFloat(parts[0]);
          const lat = parseFloat(parts[1]);
          if (!isNaN(lng) && !isNaN(lat)) coords.push({ lng, lat });
        }
      });
    }
    return coords;
  };

  // centroid/shoelace helpers (kept from your code)
  const calculatePolygonCentroid = (coordinates) => {
    if (coordinates.length === 0) return { lng: 0, lat: 0 };
    if (coordinates.length <= 3) {
      const sum = coordinates.reduce((acc, coord) => ({ lng: acc.lng + coord.lng, lat: acc.lat + coord.lat }), { lng: 0, lat: 0 });
      return { lng: sum.lng / coordinates.length, lat: sum.lat / coordinates.length };
    }
    let area = 0, centroidX = 0, centroidY = 0;
    for (let i = 0; i < coordinates.length - 1; i++) {
      const x0 = coordinates[i].lng, y0 = coordinates[i].lat;
      const x1 = coordinates[i+1].lng, y1 = coordinates[i+1].lat;
      const a = x0 * y1 - x1 * y0;
      area += a;
      centroidX += (x0 + x1) * a;
      centroidY += (y0 + y1) * a;
    }
    area *= 0.5;
    if (Math.abs(area) < 1e-10) {
      const sum = coordinates.reduce((acc, coord) => ({ lng: acc.lng + coord.lng, lat: acc.lat + coord.lat }), { lng: 0, lat: 0 });
      return { lng: sum.lng / coordinates.length, lat: sum.lat / coordinates.length };
    }
    centroidX /= (6.0 * area);
    centroidY /= (6.0 * area);
    return { lng: centroidX, lat: centroidY };
  };

  // WKT-ish and flexible coordinate parsing
  const parseWKTToFullGeometry = (wktString) => {
    if (!wktString || typeof wktString !== 'string') return null;
    const cleanWKT = wktString.trim();
    const pointMatch = cleanWKT.match(/POINT\s*\(\s*([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)\s*\)/i);
    if (pointMatch) return { type: 'Point', coordinates: [parseFloat(pointMatch[1]), parseFloat(pointMatch[2])] };

    const multipolygonMatch = cleanWKT.match(/MULTIPOLYGON\s*\(\(\(\s*(.*?)\s*\)\)\)/i);
    if (multipolygonMatch) {
      const coords = extractCoordinatesFromPolygon(multipolygonMatch[1]);
      if (coords.length > 0) {
        const geoJsonCoords = coords.map(c => [c.lng, c.lat]);
        return { type: 'Polygon', coordinates: [geoJsonCoords] };
      }
    }

    const polygonMatch = cleanWKT.match(/POLYGON\s*\(\(\s*(.*?)\s*\)\)/i);
    if (polygonMatch) {
      const coords = extractCoordinatesFromPolygon(polygonMatch[1]);
      if (coords.length > 0) {
        const geoJsonCoords = coords.map(c => [c.lng, c.lat]);
        return { type: 'Polygon', coordinates: [geoJsonCoords] };
      }
    }

    return null;
  };

  const parseCombinedCoordinates = (coordString) => {
    if (!coordString || typeof coordString !== 'string') return null;

    // Try WKT parse
    const wktResult = parseWKT(coordString);
    if (wktResult && wktResult.coordinates) {
      return { lng: wktResult.coordinates[0], lat: wktResult.coordinates[1] };
    }

    // comma-separated
    const commaMatch = coordString.match(/([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)/);
    if (commaMatch) {
      const coord1 = parseFloat(commaMatch[1]);
      const coord2 = parseFloat(commaMatch[2]);
      if (Math.abs(coord1) <= 90 && Math.abs(coord2) <= 180) return { lat: coord1, lng: coord2 };
      if (Math.abs(coord2) <= 90 && Math.abs(coord1) <= 180) return { lat: coord2, lng: coord1 };
    }

    // space-separated
    const spaceMatch = coordString.match(/([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)/);
    if (spaceMatch) {
      const coord1 = parseFloat(spaceMatch[1]);
      const coord2 = parseFloat(spaceMatch[2]);
      if (Math.abs(coord1) <= 90 && Math.abs(coord2) <= 180) return { lat: coord1, lng: coord2 };
      if (Math.abs(coord2) <= 90 && Math.abs(coord1) <= 180) return { lat: coord2, lng: coord1 };
      return { lng: coord1, lat: coord2 };
    }

    return null;
  };

  const parseWKT = (wktString) => {
    if (!wktString || typeof wktString !== 'string') return null;
    const cleanWKT = wktString.trim();
    const pointMatch = cleanWKT.match(/POINT\s*\(\s*([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)\s*\)/i);
    if (pointMatch) return { type: 'Point', coordinates: [parseFloat(pointMatch[1]), parseFloat(pointMatch[2])] };

    const multipolygonMatch = cleanWKT.match(/MULTIPOLYGON\s*\(\(\(\s*(.*?)\s*\)\)\)/i);
    if (multipolygonMatch) {
      const coords = extractCoordinatesFromPolygon(multipolygonMatch[1]);
      if (coords.length > 0) {
        const centroid = calculatePolygonCentroid(coords);
        return { type: 'Point', coordinates: [centroid.lng, centroid.lat] };
      }
    }

    const polygonMatch = cleanWKT.match(/POLYGON\s*\(\(\s*(.*?)\s*\)\)/i);
    if (polygonMatch) {
      const coords = extractCoordinatesFromPolygon(polygonMatch[1]);
      if (coords.length > 0) {
        const centroid = calculatePolygonCentroid(coords);
        return { type: 'Point', coordinates: [centroid.lng, centroid.lat] };
      }
    }

    const linestringMatch = cleanWKT.match(/LINESTRING\s*\(\s*(.*?)\s*\)/i);
    if (linestringMatch) {
      const coords = extractCoordinatesFromPolygon(linestringMatch[1]);
      if (coords.length > 0) {
        const midpoint = coords[Math.floor(coords.length / 2)];
        return { type: 'Point', coordinates: [midpoint.lng, midpoint.lat] };
      }
    }

    return null;
  };

  const detectCoordinateColumns = (headers) => {
    const latCandidates = ['latitude', 'lat', 'y_coord', 'lat_dd', 'latitude_dd', 'lat_deg', 'decimal_lat'];
    const lngCandidates = ['longitude', 'lng', 'lon', 'x_coord', 'lng_dd', 'longitude_dd', 'long', 'decimal_lng', 'decimal_lon'];
    const combinedCandidates = ['location', 'coordinates', 'point', 'geometry', 'latlng', 'latlon', 'coord', 'the_geom', 'geom', 'wkt'];

    const headerLower = headers.map(h => h.toLowerCase().trim());
    const combinedCol = headers.find((h, i) => combinedCandidates.includes(headerLower[i]));
    if (combinedCol) return { lat: null, lng: null, combined: combinedCol };

    let latCol = headers.find((h, i) => latCandidates.includes(headerLower[i]));
    let lngCol = headers.find((h, i) => lngCandidates.includes(headerLower[i]));

    if (!latCol) {
      latCol = headers.find((h, i) => {
        const header = headerLower[i];
        return latCandidates.some(candidate => header.includes(candidate) && header.length <= candidate.length + 3 && (header.startsWith(candidate) || header.endsWith(candidate)));
      });
    }
    if (!lngCol) {
      lngCol = headers.find((h, i) => {
        const header = headerLower[i];
        return lngCandidates.some(candidate => header.includes(candidate) && header.length <= candidate.length + 3 && (header.startsWith(candidate) || header.endsWith(candidate)));
      });
    }

    return { lat: latCol, lng: lngCol, combined: null };
  };

  const parseCSV = async (file) => new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      delimitersToGuess: [',', '\t', '|', ';'],
      complete: (results) => {
        const cleanData = results.data.map(row => {
          const cleanRow = {};
          Object.keys(row).forEach(key => {
            const cleanKey = key.trim();
            cleanRow[cleanKey] = row[key];
          });
          return cleanRow;
        });
        resolve(cleanData);
      },
      error: (err) => reject(err)
    });
  });

  const parseExcel = async (file) => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellStyles: true });
    const sheets = {};
    const sheetNames = workbook.SheetNames;
    sheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);
      const cleanData = data.map(row => {
        const cleanRow = {};
        Object.keys(row).forEach(key => {
          const cleanKey = key.trim();
          cleanRow[cleanKey] = row[key];
        });
        return cleanRow;
      });
      sheets[sheetName] = cleanData;
    });
    return { sheets, sheetNames };
  };

  const convertToGeoJSONWithFullGeometry = (data, coords) => {
    const validFeatures = [];
    data.forEach(row => {
      if (coords.combined) {
        const fullGeometry = parseWKTToFullGeometry(row[coords.combined]);
        if (fullGeometry) {
          validFeatures.push({ type: 'Feature', geometry: fullGeometry, properties: row });
          return;
        }
        const parsed = parseCombinedCoordinates(row[coords.combined]);
        if (parsed) {
          validFeatures.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [parsed.lng, parsed.lat] }, properties: row });
        }
      } else if (coords.lat && coords.lng) {
        const lat = parseFloat(row[coords.lat]);
        const lng = parseFloat(row[coords.lng]);
        if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          validFeatures.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: row });
        }
      }
    });
    return validFeatures;
  };

  useEffect(() => {
    if (hasLoadedRef.current) return;

    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      setInfo('Parsing file...');

      try {
        const file = files?.[0];
        if (!file) throw new Error('No file provided');

        const fileName = file.name.toLowerCase();
        const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
        setIsExcelFile(isExcel);

        if (fileName.endsWith('.csv')) {
          const parsedData = await parseCSV(file);
          const headers = parsedData.length ? Object.keys(parsedData[0]) : [];
          const coords = detectCoordinateColumns(headers);
          if (!coords.lat && !coords.lng && !coords.combined) {
            // nothing to map — return table-only: convert to empty geojson and call onConvert with empty FC
            const emptyFc = { type: 'FeatureCollection', features: [] };
            try { window.__DEBUG_LAST_GEOJSON__ = emptyFc; } catch (e) {}
            setInfo('No coordinate columns detected');
            if (typeof onConvert === 'function') onConvert(emptyFc);
            setIsLoading(false);
            hasLoadedRef.current = true;
            return;
          }

          const geoFeatures = convertToGeoJSONWithFullGeometry(parsedData, coords);
          const fc = { type: 'FeatureCollection', features: geoFeatures };
          try { window.__DEBUG_LAST_GEOJSON__ = fc; } catch (e) {}
          setInfo(`Converted ${geoFeatures.length} mappable rows`);
          if (typeof onConvert === 'function') onConvert(fc);
          setIsLoading(false);
          hasLoadedRef.current = true;
          return;
        } else if (isExcel) {
          const excelData = await parseExcel(file);
          setSheetNames(excelData.sheetNames);
          setActiveSheet(excelData.sheetNames[0] || '');
          setInfo(`Excel parsed: ${excelData.sheetNames.join(', ')}`);
          // For Excel, return an empty FC so caller can decide how to handle (or implement sheet selection in parent)
          const emptyFc = { type: 'FeatureCollection', features: [] };
          try { window.__DEBUG_LAST_GEOJSON__ = emptyFc; } catch (e) {}
          if (typeof onConvert === 'function') onConvert(emptyFc);
          setIsLoading(false);
          hasLoadedRef.current = true;
          return;
        } else {
          throw new Error('Unsupported file type (only CSV / XLSX allowed)');
        }
      } catch (err) {
        console.error('[CSV/Excel] Error:', err);
        setError(err.message || 'Failed to parse file');
        setIsLoading(false);
      }
    };

    loadData();
    return () => { hasLoadedRef.current = false; };
  }, [files, onConvert]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 p-4">
        <div>
          <div className="animate-spin h-8 w-8 border-4 border-[#008080] border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-gray-600">Converting file to GeoJSON…</p>
          {info && <p className="text-xs text-gray-500 mt-2">{info}</p>}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-600">
        <p className="font-semibold">Error converting file</p>
        <p>{error}</p>
        {onClose && <button onClick={onClose} className="mt-2 px-3 py-1 rounded bg-gray-200">Close</button>}
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="text-sm text-green-700">{info || 'Conversion complete'}</div>
      <div className="mt-3">
        {typeof onConvert === 'function' && (
          <button onClick={() => typeof onConvert === 'function' && onConvert(window.__DEBUG_LAST_GEOJSON__)} className="px-3 py-1 bg-blue-600 text-white rounded">
            Open in GeoJSON Preview
          </button>
        )}
        {onClose && <button onClick={onClose} className="ml-2 px-3 py-1 rounded bg-gray-200">Close</button>}
      </div>
    </div>
  );
};

export default CsvExcelPreview;
