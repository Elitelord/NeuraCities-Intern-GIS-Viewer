import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as shapefile from 'shapefile';

const ShapefilePreview = ({ files, onClose }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [features, setFeatures] = useState([]);
  const [mapBounds, setMapBounds] = useState(null);
  const [leafletReady, setLeafletReady] = useState(false);
const hasLoadedRef = useRef(false);

  const calculateBounds = useCallback((features) => {
    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;

    const processCoords = (coords) => {
      if (typeof coords[0] === 'number') {
        const [lng, lat] = coords;
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
      } else {
        coords.forEach(processCoords);
      }
    };

    features.forEach(f => {
      if (f.geometry && f.geometry.coordinates) {
        processCoords(f.geometry.coordinates);
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
      finish(); // already loaded
    } else {
      // Already loading — wait briefly and retry
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
          return window.L.circleMarker(latlng, {
            radius: 4,
            fillColor: '#FF5747',
            color: '#FF5747',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
          });
        },
        style: (feature) => {
          // For non-point geometries (polygons, lines)
          if (feature.geometry.type !== 'Point') {
            return {
              color: '#FF5747',
              weight: 2,
              fillColor: '#FF5747',
              fillOpacity: 0.3
            };
          }
        },
        onEachFeature: (feature, layer) => {
          if (feature.properties) {
            const content = Object.entries(feature.properties)
              .map(([k, v]) => `<strong>${k}</strong>: ${v}`)
              .join('<br/>');
            layer.bindPopup(content);
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

  // Load shapefile data
  useEffect(() => {
    if (hasLoadedRef.current) return; 
    const loadShapefile = async () => {
      hasLoadedRef.current = true; 
      setIsLoading(true);
      setError(null);

      const shpFile = files.find(f => f.name.toLowerCase().endsWith('.shp'));
      const dbfFile = files.find(f => f.name.toLowerCase().endsWith('.dbf'));

      if (!shpFile || !dbfFile) {
        setError('Please upload both .shp and .dbf files.');
        setIsLoading(false);
        return;
      }

      try {
        const shpBuffer = await shpFile.arrayBuffer();
        const dbfBuffer = await dbfFile.arrayBuffer();

        const reader = await shapefile.open(shpBuffer, dbfBuffer);

        const geojsonFeatures = [];
        let result = await reader.read();
        while (!result.done) {
          geojsonFeatures.push(result.value);
          result = await reader.read();
        }

        if (geojsonFeatures.length === 0) {
          throw new Error('No valid features found in shapefile.');
        }

        const bounds = calculateBounds(geojsonFeatures);
        
        setFeatures(geojsonFeatures);
        setMapBounds(bounds);
        loadLeaflet();
      } catch (err) {
        setError(err.message || 'Failed to parse shapefile');
        setIsLoading(false);
      }
    };

    loadShapefile();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      hasLoadedRef.current = false;
    };
  }, [files]);

  // Initialize map when Leaflet is ready and we have data
  useEffect(() => {
    if (leafletReady && features.length > 0 && mapBounds) {
      initializeMap();
    }
  }, [leafletReady, features, mapBounds, initializeMap]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-[#008080] border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Loading and parsing shapefile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-600 text-center p-4">
        <p className="font-bold text-lg mb-2">Error loading shapefile</p>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[500px]">
      <div ref={mapRef} className="absolute inset-0" />
    </div>
  );
};

export default ShapefilePreview;