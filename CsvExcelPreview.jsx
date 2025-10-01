import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

const CsvExcelPreview = ({ files, onClose }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [features, setFeatures] = useState([]);
  const [mapBounds, setMapBounds] = useState(null);
  const [leafletReady, setLeafletReady] = useState(false);
  const [data, setData] = useState([]);
  const [coordinateColumns, setCoordinateColumns] = useState({ lat: null, lng: null });
  const [totalRows, setTotalRows] = useState(0);
  const [mappableRows, setMappableRows] = useState(0);
  const hasLoadedRef = useRef(false);
  
  const [isExcelFile, setIsExcelFile] = useState(false);
  const [excelSheets, setExcelSheets] = useState({});
  const [activeSheet, setActiveSheet] = useState('');
  const [sheetNames, setSheetNames] = useState([]);

  // DEBUG
  console.log('CsvExcelPreview render:', {
    isLoading,
    error: !!error,
    dataLength: data.length,
    coordinateColumns,
    mappableRows,
    totalRows,
    isExcelFile,
    activeSheet,
    sheetNames
  });

  const calculateBounds = useCallback((features) => {
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;

  features.forEach(feature => {
    if (feature.geometry) {
      if (feature.geometry.type === 'Point') {
        const [lng, lat] = feature.geometry.coordinates;
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
      } else if (feature.geometry.type === 'Polygon') {
        const coordinates = feature.geometry.coordinates[0]; 
        coordinates.forEach(([lng, lat]) => {
          minLat = Math.min(minLat, lat);
          maxLat = Math.max(maxLat, lat);
          minLng = Math.min(minLng, lng);
          maxLng = Math.max(maxLng, lng);
        });
      } else if (feature.geometry.type === 'MultiPolygon') {
        feature.geometry.coordinates.forEach(polygon => {
          const ring = polygon[0]; 
          ring.forEach(([lng, lat]) => {
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
            minLng = Math.min(minLng, lng);
            maxLng = Math.max(maxLng, lng);
          });
        });
      }
    }
  });

  return {
    north: maxLat,
    south: minLat,
    east: maxLng,
    west: minLng
  };
}, []);

  const loadLeaflet = useCallback(() => {
    const finish = () => {
      if (!window.L) {
        setError('Leaflet failed to load. Please check your network or CSP settings.');
        setIsLoading(false);
        return;
      }

      setLeafletReady(true);
      setIsLoading(false);
    };

    // Load CSS only if not already present
    if (!document.querySelector('link[href*="leaflet.min.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    // Load JS only if not already present
    if (!window.L && !document.querySelector('script[src*="leaflet.min.js"]')) {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => {
        finish();
      };
      script.onerror = () => {
        setError('Failed to load Leaflet.js');
        setIsLoading(false);
      };
      document.head.appendChild(script);
    } else if (window.L) {
      finish();
    } else {
      setTimeout(() => {
        if (window.L) finish();
        else {
          setError('Leaflet failed to load in time.');
          setIsLoading(false);
        }
      }, 1000);
    }
  }, []);

  const initializeMap = useCallback(() => {
    if (!window.L || !mapRef.current || mapInstanceRef.current || features.length === 0 || !mapBounds) {
      console.log('Map initialization skipped:', {
        hasLeaflet: !!window.L,
        hasMapRef: !!mapRef.current,
        hasMapInstance: !!mapInstanceRef.current,
        featuresLength: features.length,
        hasMapBounds: !!mapBounds
      });
      return;
    }

    const centerLat = (mapBounds.north + mapBounds.south) / 2;
    const centerLng = (mapBounds.east + mapBounds.west) / 2;

    try {
      const map = window.L.map(mapRef.current, { zoomControl: false }).setView([centerLat, centerLng], 10);
      mapInstanceRef.current = map;

      window.L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO',
        subdomains: 'abcd',
        maxZoom: 19
      }).addTo(map);

      const geojsonLayer = window.L.geoJSON({ type: 'FeatureCollection', features }, {
    pointToLayer: (feature, latlng) => {
      // Handle points as before
      return window.L.circleMarker(latlng, {
        radius: 6,
        fillColor: '#FF5747',
        color: '#FF5747',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
      });
    },
    style: (feature) => {
      // Handle polygons
      if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
        return {
          fillColor: '#FF5747',
          weight: 2,
          opacity: 1,
          color: '#FF5747',
          fillOpacity: 0.3
        };
      }
    },
    onEachFeature: (feature, layer) => {
      if (feature.properties) {
        const content = Object.entries(feature.properties)
          .filter(([k, v]) => v !== null && v !== undefined && v !== '')
          .map(([k, v]) => `<strong>${k}</strong>: ${v}`)
          .join('<br/>');
        if (content) {
          layer.bindPopup(content);
        }
      }
    }
  }).addTo(map);

      try {
        map.fitBounds(geojsonLayer.getBounds(), { padding: [20, 20] });
      } catch (e) {
        console.warn('Could not fit bounds, using center view');
        map.setView([centerLat, centerLng], 10);
      }

      // Force map to recalculate its size
      setTimeout(() => {
        map.invalidateSize();
      }, 100);

    } catch (err) {
      setError('Error initializing map: ' + err.message);
    }
  }, [features, mapBounds]);

  const extractCoordinatesFromPolygon = (coordString) => {
  const coords = [];
  // Match coordinate pairs: number space number
  const matches = coordString.match(/([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)/g);
  
  if (matches) {
    matches.forEach(match => {
      const parts = match.trim().split(/\s+/);
      if (parts.length >= 2) {
        const lng = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        if (!isNaN(lng) && !isNaN(lat)) {
          coords.push({ lng, lat });
        }
      }
    });
  }
  
  return coords;
};

// Calculate true centroid of polygon using the shoelace formula
const calculatePolygonCentroid = (coordinates) => {
  if (coordinates.length === 0) return { lng: 0, lat: 0 };
  
  // For simple cases, use arithmetic mean
  if (coordinates.length <= 3) {
    const sum = coordinates.reduce((acc, coord) => ({
      lng: acc.lng + coord.lng,
      lat: acc.lat + coord.lat
    }), { lng: 0, lat: 0 });
    
    return {
      lng: sum.lng / coordinates.length,
      lat: sum.lat / coordinates.length
    };
  }
  
  // For complex polygons, use the shoelace formula for true centroid
  let area = 0;
  let centroidX = 0;
  let centroidY = 0;
  
  for (let i = 0; i < coordinates.length - 1; i++) {
    const x0 = coordinates[i].lng;
    const y0 = coordinates[i].lat;
    const x1 = coordinates[i + 1].lng;
    const y1 = coordinates[i + 1].lat;
    
    const a = x0 * y1 - x1 * y0;
    area += a;
    centroidX += (x0 + x1) * a;
    centroidY += (y0 + y1) * a;
  }
  
  area *= 0.5;
  
  // Handle degenerate cases
  if (Math.abs(area) < 1e-10) {
    // Fall back to arithmetic mean for very small or degenerate polygons
    const sum = coordinates.reduce((acc, coord) => ({
      lng: acc.lng + coord.lng,
      lat: acc.lat + coord.lat
    }), { lng: 0, lat: 0 });
    
    return {
      lng: sum.lng / coordinates.length,
      lat: sum.lat / coordinates.length
    };
  }
  
  centroidX /= (6.0 * area);
  centroidY /= (6.0 * area);
  
  return {
    lng: centroidX,
    lat: centroidY
  };
};

const parseWKTToFullGeometry = (wktString) => {
  if (!wktString || typeof wktString !== 'string') return null;
  
  const cleanWKT = wktString.trim();
  
  // POINT parsing
  const pointMatch = cleanWKT.match(/POINT\s*\(\s*([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)\s*\)/i);
  if (pointMatch) {
    return {
      type: 'Point',
      coordinates: [parseFloat(pointMatch[1]), parseFloat(pointMatch[2])]
    };
  }
  
  // MULTIPOLYGON parsing - return full geometry
  const multipolygonMatch = cleanWKT.match(/MULTIPOLYGON\s*\(\(\(\s*(.*?)\s*\)\)\)/i);
  if (multipolygonMatch) {
    const coords = extractCoordinatesFromPolygon(multipolygonMatch[1]);
    if (coords.length > 0) {
      // Convert to GeoJSON format: [[[lng, lat], [lng, lat], ...]]
      const geoJsonCoords = coords.map(coord => [coord.lng, coord.lat]);
      return {
        type: 'Polygon',
        coordinates: [geoJsonCoords]
      };
    }
  }
  
  // POLYGON parsing - return full geometry
  const polygonMatch = cleanWKT.match(/POLYGON\s*\(\(\s*(.*?)\s*\)\)/i);
  if (polygonMatch) {
    const coords = extractCoordinatesFromPolygon(polygonMatch[1]);
    if (coords.length > 0) {
      const geoJsonCoords = coords.map(coord => [coord.lng, coord.lat]);
      return {
        type: 'Polygon',
        coordinates: [geoJsonCoords]
      };
    }
  }
  
  return null;
};

const convertToGeoJSONWithFullGeometry = (data, coords) => {
  const validFeatures = [];
  
  data.forEach(row => {
    if (coords.combined) {
      // Try to parse as full geometry first
      const fullGeometry = parseWKTToFullGeometry(row[coords.combined]);
      if (fullGeometry) {
        validFeatures.push({
          type: 'Feature',
          geometry: fullGeometry,
          properties: row
        });
        return;
      }
      
      // Fall back to point parsing
      const parsed = parseCombinedCoordinates(row[coords.combined]);
      if (parsed) {
        validFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [parsed.lng, parsed.lat]
          },
          properties: row
        });
      }
    } else if (coords.lat && coords.lng) {
      // Handle separate lat/lng columns
      const lat = parseFloat(row[coords.lat]);
      const lng = parseFloat(row[coords.lng]);
      
      if (!isNaN(lat) && !isNaN(lng) && 
          lat >= -90 && lat <= 90 && 
          lng >= -180 && lng <= 180) {
        validFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          properties: row
        });
      }
    }
  });
  
  return validFeatures;
};


// Updated parseCombinedCoordinates function that uses the WKT parser
const parseCombinedCoordinates = (coordString) => {
  if (!coordString || typeof coordString !== 'string') return null;
  
  // First try comprehensive WKT parsing
  const wktResult = parseWKT(coordString);
  if (wktResult && wktResult.coordinates) {
    return {
      lng: wktResult.coordinates[0],
      lat: wktResult.coordinates[1]
    };
  }
  
  // Fall back to simple coordinate parsing for non-WKT formats
  
  // Handle comma-separated format: "-95.80545, 29.54898" or "29.54898, -95.80545"
  const commaMatch = coordString.match(/([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)/);
  if (commaMatch) {
    const coord1 = parseFloat(commaMatch[1]);
    const coord2 = parseFloat(commaMatch[2]);
    
    // Determine which is lat and which is lng based on typical ranges
    // Latitude: -90 to 90, Longitude: -180 to 180
    if (Math.abs(coord1) <= 90 && Math.abs(coord2) <= 180) {
      // First number looks like latitude
      return { lat: coord1, lng: coord2 };
    } else if (Math.abs(coord2) <= 90 && Math.abs(coord1) <= 180) {
      // Second number looks like latitude
      return { lat: coord2, lng: coord1 };
    }
  }
  
  // Handle space-separated format: "-95.80545 29.54898"
  const spaceMatch = coordString.match(/([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)/);
  if (spaceMatch) {
    const coord1 = parseFloat(spaceMatch[1]);
    const coord2 = parseFloat(spaceMatch[2]);
    
    // Similar logic as comma-separated
    if (Math.abs(coord1) <= 90 && Math.abs(coord2) <= 180) {
      return { lat: coord1, lng: coord2 };
    } else if (Math.abs(coord2) <= 90 && Math.abs(coord1) <= 180) {
      return { lat: coord2, lng: coord1 };
    } else {
      // Default assumption: lng lat (like WKT format)
      return { lng: coord1, lat: coord2 };
    }
  }
  
  return null;
};

  const parseWKT = (wktString) => {
  if (!wktString || typeof wktString !== 'string') return null;
  
  // Clean the string
  const cleanWKT = wktString.trim();
  
  // POINT parsing
  const pointMatch = cleanWKT.match(/POINT\s*\(\s*([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)\s*\)/i);
  if (pointMatch) {
    return {
      type: 'Point',
      coordinates: [parseFloat(pointMatch[1]), parseFloat(pointMatch[2])]
    };
  }
  
  // MULTIPOLYGON parsing - extract centroid from first (usually largest) polygon
  const multipolygonMatch = cleanWKT.match(/MULTIPOLYGON\s*\(\(\(\s*(.*?)\s*\)\)\)/i);
  if (multipolygonMatch) {
    const coords = extractCoordinatesFromPolygon(multipolygonMatch[1]);
    if (coords.length > 0) {
      const centroid = calculatePolygonCentroid(coords);
      return {
        type: 'Point',
        coordinates: [centroid.lng, centroid.lat]
      };
    }
  }
  
  // POLYGON parsing - extract centroid
  const polygonMatch = cleanWKT.match(/POLYGON\s*\(\(\s*(.*?)\s*\)\)/i);
  if (polygonMatch) {
    const coords = extractCoordinatesFromPolygon(polygonMatch[1]);
    if (coords.length > 0) {
      const centroid = calculatePolygonCentroid(coords);
      return {
        type: 'Point',
        coordinates: [centroid.lng, centroid.lat]
      };
    }
  }
  
  // LINESTRING parsing - extract midpoint
  const linestringMatch = cleanWKT.match(/LINESTRING\s*\(\s*(.*?)\s*\)/i);
  if (linestringMatch) {
    const coords = extractCoordinatesFromPolygon(linestringMatch[1]);
    if (coords.length > 0) {
      const midpoint = coords[Math.floor(coords.length / 2)];
      return {
        type: 'Point',
        coordinates: [midpoint.lng, midpoint.lat]
      };
    }
  }
  
  return null;
};


  const detectCoordinateColumns = (headers) => {
    const latCandidates = ['latitude', 'lat', 'y_coord', 'lat_dd', 'latitude_dd', 'lat_deg', 'decimal_lat'];
    const lngCandidates = ['longitude', 'lng', 'lon', 'x_coord', 'lng_dd', 'longitude_dd', 'long', 'decimal_lng', 'decimal_lon'];
const combinedCandidates = ['location', 'coordinates', 'point', 'geometry', 'latlng', 'latlon', 'coord', 'the_geom', 'geom', 'wkt'];
    
    const headerLower = headers.map(h => h.toLowerCase().trim());
    
    // First check for combined coordinate columns (like "POINT (-95.80545 29.54898)")
    const combinedCol = headers.find((h, i) => 
      combinedCandidates.includes(headerLower[i])
    );
    
    if (combinedCol) {
      return { lat: null, lng: null, combined: combinedCol };
    }
    
    // Then try exact matches for separate columns
    let latCol = headers.find((h, i) => 
      latCandidates.includes(headerLower[i])
    );
    
    let lngCol = headers.find((h, i) => 
      lngCandidates.includes(headerLower[i])
    );
    
    // If no exact match found, try partial matches but be more strict
    if (!latCol) {
      latCol = headers.find((h, i) => {
        const header = headerLower[i];
        return latCandidates.some(candidate => {
          // Only match if the header contains the candidate and is reasonable length
          return header.includes(candidate) && 
                 header.length <= candidate.length + 3 && // Allow for short prefixes/suffixes
                 (header.startsWith(candidate) || header.endsWith(candidate));
        });
      });
    }
    
    if (!lngCol) {
      lngCol = headers.find((h, i) => {
        const header = headerLower[i];
        return lngCandidates.some(candidate => {
          return header.includes(candidate) && 
                 header.length <= candidate.length + 3 &&
                 (header.startsWith(candidate) || header.endsWith(candidate));
        });
      });
    }
    
    return { lat: latCol, lng: lngCol, combined: null };
  };

  const parseCSV = async (file) => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        delimitersToGuess: [',', '\t', '|', ';'],
        complete: (results) => {
          // Clean headers of whitespace
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
        error: (error) => {
          reject(error);
        }
      });
    });
  };

  const parseExcel = async (file) => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { 
      type: 'buffer',
      cellDates: true,
      cellStyles: true 
    });
    
    // Store all sheets
    const sheets = {};
    const sheetNames = workbook.SheetNames;
    
    sheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);
      
      // Clean headers of whitespace
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

  const convertToGeoJSON = (data, coords) => {
    const validFeatures = [];
    
    data.forEach(row => {
      let lat, lng;
      
      if (coords.combined) {
        // Handle combined coordinate column
        const parsed = parseCombinedCoordinates(row[coords.combined]);
        if (!parsed) return; // Skip if parsing failed
        lat = parsed.lat;
        lng = parsed.lng;
      } else if (coords.lat && coords.lng) {
        // Handle separate lat/lng columns
        lat = parseFloat(row[coords.lat]);
        lng = parseFloat(row[coords.lng]);
      } else {
        return; // Skip if no valid coordinate columns
      }
      
      // Check if coordinates are valid numbers and within reasonable bounds
      if (!isNaN(lat) && !isNaN(lng) && 
          lat >= -90 && lat <= 90 && 
          lng >= -180 && lng <= 180) {
        validFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          properties: row
        });
      }
    });
    
    return validFeatures;
  };

  // Handle sheet change for Excel files
  const handleSheetChange = useCallback((sheetName) => {
    if (!excelSheets[sheetName]) return;
    
    setActiveSheet(sheetName);
    const sheetData = excelSheets[sheetName];
    setData(sheetData);
    setTotalRows(sheetData.length);
    
    console.log('Switched to sheet:', sheetName, 'with', sheetData.length, 'rows');
  }, [excelSheets]);

  // Load and parse the data
  useEffect(() => {
    if (hasLoadedRef.current) return;
    
    const loadData = async () => {
      hasLoadedRef.current = true;
      setIsLoading(true);
      setError(null);

      const file = files[0]; // Assuming single file for CSV/Excel
      
      try {
        let parsedData;
        const fileName = file.name.toLowerCase();
        const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
        
        setIsExcelFile(isExcel);
        
        if (fileName.endsWith('.csv')) {
          console.log('📄 Parsing CSV file');
          parsedData = await parseCSV(file);
          setData(parsedData);
          setTotalRows(parsedData.length);
          
          if (!parsedData.length) {
            parsedData = [{}];
          }

          const headers = Object.keys(parsedData[0]);
          const coords = detectCoordinateColumns(headers);
          
          console.log('🔍 Coordinate detection result:', coords);
          console.log('🔍 Available headers:', headers);
          
          if ((!coords.lat || !coords.lng) && !coords.combined) {
            // No coordinates found, show table view instead
            setCoordinateColumns({ lat: null, lng: null });
            setMappableRows(0);
            setIsLoading(false);
            return;
          } else {
            // Set coordinate columns when found
            setCoordinateColumns(coords);
          }

          
          const geoFeatures = convertToGeoJSONWithFullGeometry(parsedData, coords);
          setMappableRows(geoFeatures.length);
          
          
          if (geoFeatures.length === 0) {
            setIsLoading(false);
            return;
          }

          const bounds = calculateBounds(geoFeatures);
          
          setFeatures(geoFeatures);
          setMapBounds(bounds);
          loadLeaflet();
          
        } else if (isExcel) {
          const excelData = await parseExcel(file);
          
          if (!excelData.sheetNames.length) {
            throw new Error('No sheets found in Excel file');
          }

          setExcelSheets(excelData.sheets);
          setSheetNames(excelData.sheetNames);
          
          // Set the first sheet as active
          const firstSheet = excelData.sheetNames[0];
          setActiveSheet(firstSheet);
          const firstSheetData = excelData.sheets[firstSheet];
          
          setData(firstSheetData);
          setTotalRows(firstSheetData.length);
          
          // For Excel files, we skip coordinate detection and go straight to table view
          setCoordinateColumns({ lat: null, lng: null });
          setMappableRows(0);
          setIsLoading(false);
          
        } else {
          throw new Error('Unsupported file type');
        }

      } catch (err) {
        setError(err.message || 'Failed to parse file');
        setIsLoading(false);
      }
    };

    loadData();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      hasLoadedRef.current = false;
    };
  }, [files]);

  // Initialize map when Leaflet is ready and we have data (only for CSV files)
  useEffect(() => {
    if (!isExcelFile && leafletReady && features.length > 0 && mapBounds) {
      initializeMap();
    }
  }, [isExcelFile, leafletReady, features, mapBounds, initializeMap]);

  if (isLoading) {
    console.log('🔄 Showing loading state');
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-[#008080] border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Loading and parsing data file...</p>
        </div>
      </div>
    );
  }

  if (error) {
    console.log('🔄 Showing error state');
    return (
      <div className="text-red-600 text-center p-4">
        <p className="font-bold text-lg mb-2">Error loading data file</p>
        <p className="mb-4">{error}</p>
        {data.length > 0 && (
          <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md">
            <p><strong>File contains:</strong> {totalRows} rows</p>
            {coordinateColumns.lat && coordinateColumns.lng && (
              <p><strong>Detected coordinate columns:</strong> {coordinateColumns.lat}, {coordinateColumns.lng}</p>
            )}
          </div>
        )}
      </div>
    );
  }

const shouldShowTable = isExcelFile || 
  (!coordinateColumns.lat && !coordinateColumns.lng && !coordinateColumns.combined) || 
  mappableRows === 0 || 
  totalRows === 0 || 
  (data.length === 1 && Object.keys(data[0]).length === 0);

  console.log('Render decision:', {
    isLoading,
    error: !!error,
    dataLength: data.length,
    coordinateColumns,
    mappableRows,
    shouldShowTable,
    isExcelFile,
    activeSheet,
    'coordinateColumns.lat': coordinateColumns.lat,
    'coordinateColumns.lng': coordinateColumns.lng,
    'coordinateColumns.combined': coordinateColumns.combined,
    'hasSeparateCoords': !!(coordinateColumns.lat && coordinateColumns.lng),
    'hasCombinedCoords': !!coordinateColumns.combined,
    'mappableRows === 0': mappableRows === 0
  });

if (shouldShowTable) {
const headers = data[0] && Object.keys(data[0]).length > 0 ? Object.keys(data[0]) : ['Column 1', 'Column 2', 'Column 3']; // Default empty columns
    const displayData = data.slice(0, 100);
    
    let statusMessage = "Table View";
    let statusDetail = "";
    
    if (totalRows === 0 || (data.length === 1 && Object.keys(data[0]).length === 0)) {
  statusMessage = isExcelFile ? `Empty Excel Spreadsheet - ${activeSheet}` : "Empty CSV File";
  statusDetail = "No data found";
} else if (isExcelFile) {
  statusMessage = `Excel Spreadsheet - ${activeSheet}`;
  statusDetail = `Showing ${Math.min(displayData.length, 100)} of ${totalRows} rows`;
} else if (!coordinateColumns.lat && !coordinateColumns.lng && !coordinateColumns.combined) {
  statusMessage = "Table View - No coordinate columns detected";
  statusDetail = `Showing ${Math.min(displayData.length, 100)} of ${totalRows} rows`;
} else if ((coordinateColumns.lat && coordinateColumns.lng) || coordinateColumns.combined) {
  if (mappableRows === 0) {
    statusMessage = "Table View - No valid coordinate data";
    if (coordinateColumns.combined) {
      statusDetail = `Detected column: ${coordinateColumns.combined} but no valid coordinates found`;
    } else {
      statusDetail = `Detected columns: ${coordinateColumns.lat}, ${coordinateColumns.lng} but no valid coordinates found`;
    }
  }
} else {
  statusMessage = "Table View - Incomplete coordinate columns";
  statusDetail = `Found: ${coordinateColumns.lat || 'none'} (lat), ${coordinateColumns.lng || 'none'} (lng)`;
}
    
    return (
      <div className="relative w-full h-full min-h-[500px] overflow-auto p-4">
        {/* Excel sheet selector */}
        {isExcelFile && sheetNames.length > 1 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {sheetNames.map((sheetName) => (
              <button
                key={sheetName}
                onClick={() => handleSheetChange(sheetName)}
                className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  sheetName === activeSheet
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {sheetName}
              </button>
            ))}
          </div>
        )}
        
        {/* Info banner */}
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <div className="text-blue-800 font-medium">
            {statusMessage}
          </div>
          <div className="text-blue-600 text-sm">
            {statusDetail}
          </div>
        </div>
        
        {/* Table */}
        <div className="overflow-x-auto border border-gray-300 rounded-lg">
          <table className="min-w-full bg-white">
            <thead className="bg-gray-50">
              <tr>
                {headers.map((header, index) => (
                  <th key={index} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {displayData.map((row, rowIndex) => (
                <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  {headers.map((header, colIndex) => (
                    <td key={colIndex} className="px-4 py-2 text-sm text-gray-900 border-r last:border-r-0">
                      {row[header] !== null && row[header] !== undefined ? String(row[header]) : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {totalRows > 100 && (
          <div className="mt-4 text-center text-sm text-gray-500">
            Showing first 100 rows of {totalRows} total rows
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[500px]">
      <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 text-sm shadow-md z-[1000]">
        <div className="text-gray-700">
          <strong>{mappableRows}</strong> of <strong>{totalRows}</strong> rows mapped
        </div>
        <div className="text-xs text-gray-500">
          {coordinateColumns.combined ? 
            `Using ${coordinateColumns.combined}` : 
            `Using ${coordinateColumns.lat} × ${coordinateColumns.lng}`
          }
        </div>
      </div>
      
      <div ref={mapRef} className="absolute inset-0" />
    </div>
  );
};

export default CsvExcelPreview;