import React, { useEffect, useRef, useState, useCallback } from 'react';
import JSZip from 'jszip';
import * as toGeoJSON from '@tmcw/togeojson';

const KmzPreview = ({ files, onClose }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [features, setFeatures] = useState([]);
  const [mapBounds, setMapBounds] = useState(null);
  const [leafletReady, setLeafletReady] = useState(false);
  const [debugInfo, setDebugInfo] = useState('');

  // Calculate bounds from features
  const calculateBounds = useCallback((features) => {
    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;
    let validPoints = 0;

    const processCoords = (coords) => {
      if (!coords || coords.length === 0) return;
      
      if (typeof coords[0] === 'number' && coords.length >= 2) {
        const [lng, lat] = coords;
        // More permissive validation for GADM data
        if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
          minLat = Math.min(minLat, lat);
          maxLat = Math.max(maxLat, lat);
          minLng = Math.min(minLng, lng);
          maxLng = Math.max(maxLng, lng);
          validPoints++;
        }
      } else if (Array.isArray(coords)) {
        coords.forEach(processCoords);
      }
    };

    features.forEach(f => {
      if (f.geometry && f.geometry.coordinates) {
        processCoords(f.geometry.coordinates);
      }
    });

    console.log(`[Bounds] Processed ${validPoints} valid coordinate points`);

    if (minLat === Infinity || minLng === Infinity) {
      console.warn('[Bounds] No valid coordinates found');
      return null;
    }
    
    const bounds = { north: maxLat, south: minLat, east: maxLng, west: minLng };
    console.log('[Bounds] Calculated:', bounds);
    return bounds;
  }, []);

  // Load Leaflet dynamically with better error handling
  const loadLeaflet = useCallback(() => {
    console.log('[Leaflet] Starting load process...');
    
    const checkAndLoad = () => {
      // Add CSS
      if (!document.querySelector('link[href*="leaflet"]')) {
        console.log('[Leaflet] Adding CSS...');
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      // Check if already loaded
      if (window.L) {
        console.log('[Leaflet] Already loaded');
        setLeafletReady(true);
        return;
      }

      // Add JS
      if (!document.querySelector('script[src*="leaflet"]')) {
        console.log('[Leaflet] Adding JS...');
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = () => {
          console.log('[Leaflet] JS loaded successfully');
          if (window.L) {
            setLeafletReady(true);
          } else {
            setError('Leaflet loaded but not available');
          }
        };
        script.onerror = (e) => {
          console.error('[Leaflet] Failed to load JS:', e);
          setError('Failed to load Leaflet library');
          setIsLoading(false);
        };
        document.head.appendChild(script);
      }
    };

    checkAndLoad();
  }, []);

  // Initialize map with better error handling
  const initializeMap = useCallback(() => {
    if (!window.L) {
      console.error('[Map] Leaflet not available');
      return;
    }

    if (!mapRef.current) {
      console.error('[Map] Map container ref not available');
      return;
    }

    if (mapInstanceRef.current) {
      console.log('[Map] Map already initialized');
      return;
    }

    if (features.length === 0 || !mapBounds) {
      console.error('[Map] No features or bounds');
      return;
    }

    console.log('[Map] All checks passed, initializing...');

    try {
      // Ensure container has dimensions
      const container = mapRef.current;
      if (!container.offsetHeight) {
        container.style.height = '600px';
      }

      const centerLat = (mapBounds.north + mapBounds.south) / 2;
      const centerLng = (mapBounds.east + mapBounds.west) / 2;

      console.log('[Map] Creating map at center:', [centerLat, centerLng]);

      // Create map
      const map = window.L.map(container, {
        center: [centerLat, centerLng],
        zoom: 5,
        zoomControl: true,
        preferCanvas: true // Better performance for complex polygons
      });
      
      mapInstanceRef.current = map;

      // Add tile layer with fallback
      const tileLayer = window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
        errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
      });
      
      tileLayer.addTo(map);
      
      // Log tile layer events for debugging
      tileLayer.on('loading', () => console.log('[Tiles] Loading...'));
      tileLayer.on('load', () => console.log('[Tiles] Loaded'));
      tileLayer.on('tileerror', (e) => console.error('[Tiles] Error loading tile:', e));

      // Create GeoJSON layer with specific handling for GADM data
      console.log('[Map] Adding', features.length, 'features to map');
      
      const geojsonLayer = window.L.geoJSON({ 
        type: 'FeatureCollection', 
        features: features 
      }, {
        style: (feature) => {
          // GADM data is usually administrative boundaries (polygons)
          const baseStyle = {
            color: '#2563eb',
            weight: 2,
            opacity: 0.8,
            fillOpacity: 0.1,
            fillColor: '#3b82f6'
          };
          
          if (feature.geometry.type === 'Point') {
            return {}; // Points handled by pointToLayer
          }
          
          return baseStyle;
        },
        pointToLayer: (feature, latlng) => {
          return window.L.circleMarker(latlng, {
            radius: 5,
            fillColor: '#ef4444',
            color: '#fff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
          });
        },
        onEachFeature: (feature, layer) => {
          // Create popup with properties
          if (feature.properties) {
            const props = feature.properties;
            let popupContent = '<div style="max-width: 250px;">';
            
            // Common GADM properties
            if (props.NAME_1) popupContent += `<strong>${props.NAME_1}</strong><br/>`;
            if (props.TYPE_1) popupContent += `Type: ${props.TYPE_1}<br/>`;
            if (props.ENGTYPE_1) popupContent += `Type: ${props.ENGTYPE_1}<br/>`;
            
            // Add any other properties
            Object.entries(props).forEach(([key, value]) => {
              if (value && !['NAME_1', 'TYPE_1', 'ENGTYPE_1'].includes(key)) {
                popupContent += `${key}: ${value}<br/>`;
              }
            });
            
            popupContent += '</div>';
            layer.bindPopup(popupContent);
          }

          // Add hover effect
          layer.on({
            mouseover: (e) => {
              const l = e.target;
              l.setStyle({
                weight: 3,
                fillOpacity: 0.3
              });
              if (!window.L.Browser.ie && !window.L.Browser.opera && !window.L.Browser.edge) {
                l.bringToFront();
              }
            },
            mouseout: (e) => {
              geojsonLayer.resetStyle(e.target);
            }
          });
        }
      });

      geojsonLayer.addTo(map);

      // Fit bounds with padding
      const bounds = geojsonLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { 
          padding: [30, 30],
          maxZoom: 8 
        });
        console.log('[Map] Fitted to bounds:', bounds.toBBoxString());
      } else {
        console.warn('[Map] Invalid bounds, using center');
        map.setView([centerLat, centerLng], 5);
      }

      // Force a resize after a short delay
      setTimeout(() => {
        map.invalidateSize();
        console.log('[Map] Invalidated size');
      }, 250);

      // Add zoom control position
      map.zoomControl.setPosition('topright');

      // Debug info
      const debugMsg = `Loaded ${features.length} features. Map centered at [${centerLat.toFixed(2)}, ${centerLng.toFixed(2)}]`;
      setDebugInfo(debugMsg);
      console.log('[Map] Initialization complete:', debugMsg);

    } catch (err) {
      console.error('[Map] Error during initialization:', err);
      setError(`Map initialization failed: ${err.message}`);
    }
  }, [features, mapBounds]);

  // Load and process KMZ file
  useEffect(() => {
    if (!files || files.length === 0) {
      setError('No file provided');
      setIsLoading(false);
      return;
    }

    const loadKmz = async () => {
      setIsLoading(true);
      setError(null);
      setDebugInfo('Loading KMZ file...');

      try {
        const file = files[0];
        console.log('[KMZ] Loading file:', file.name, 'size:', file.size);
        
        const buffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(buffer);
        
        // Find KML file
        const kmlFile = Object.values(zip.files).find(f => 
          f.name.toLowerCase().endsWith('.kml') && !f.name.startsWith('__MACOSX')
        );
        
        if (!kmlFile) {
          throw new Error('No KML file found in KMZ archive');
        }
        
        console.log('[KMZ] Found KML:', kmlFile.name);

        const kmlText = await kmlFile.async('text');
        const parser = new DOMParser();
        const kmlDoc = parser.parseFromString(kmlText, 'application/xml');
        
        if (kmlDoc.documentElement.nodeName === 'parsererror') {
          throw new Error('Invalid KML format');
        }

        // Convert to GeoJSON
        const geojson = toGeoJSON.kml(kmlDoc);
        console.log('[KMZ] Converted to GeoJSON, features:', geojson.features?.length);

        if (!geojson.features || geojson.features.length === 0) {
          throw new Error('No features found in KML');
        }

        // Process features - handle any coordinate format issues
        const processedFeatures = [];
        
        geojson.features.forEach((feature, index) => {
          try {
            if (feature.geometry && feature.geometry.coordinates) {
              // Function to validate and clean coordinates
              const cleanCoords = (coords) => {
                if (!coords) return null;
                
                if (typeof coords[0] === 'number') {
                  // Single coordinate point [lng, lat, alt?]
                  if (coords.length >= 2) {
                    const [lng, lat] = coords;
                    // Check if coordinates are valid
                    if (!isNaN(lng) && !isNaN(lat) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
                      return [lng, lat];
                    }
                  }
                  return null;
                }
                
                // Nested coordinates
                const cleaned = coords.map(cleanCoords).filter(c => c !== null);
                return cleaned.length > 0 ? cleaned : null;
              };

              const cleaned = cleanCoords(feature.geometry.coordinates);
              if (cleaned) {
                feature.geometry.coordinates = cleaned;
                processedFeatures.push(feature);
              } else {
                console.warn(`[KMZ] Skipping feature ${index}: invalid coordinates`);
              }
            }
          } catch (e) {
            console.warn(`[KMZ] Error processing feature ${index}:`, e);
          }
        });

        console.log('[KMZ] Processed features:', processedFeatures.length);

        if (processedFeatures.length === 0) {
          throw new Error('No valid features after processing');
        }

        setFeatures(processedFeatures);
        const bounds = calculateBounds(processedFeatures);
        
        if (!bounds) {
          throw new Error('Could not calculate valid bounds');
        }
        
        setMapBounds(bounds);
        setDebugInfo(`Processed ${processedFeatures.length} features. Loading map...`);
        
        // Load Leaflet after data is ready
        loadLeaflet();
        
      } catch (err) {
        console.error('[KMZ] Error:', err);
        setError(err.message || 'Failed to load KMZ file');
        setDebugInfo('');
      } finally {
        setIsLoading(false);
      }
    };

    loadKmz();

    // Cleanup
    return () => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
          console.log('[Cleanup] Map removed');
        } catch (e) {
          console.warn('[Cleanup] Error removing map:', e);
        }
      }
    };
  }, [files, calculateBounds, loadLeaflet]);

  // Initialize map when Leaflet is ready
  useEffect(() => {
    if (leafletReady && features.length > 0 && mapBounds && !mapInstanceRef.current) {
      console.log('[Effect] Leaflet ready, initializing map...');
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        initializeMap();
      }, 100);
    }
  }, [leafletReady, features, mapBounds, initializeMap]);

  // Render UI
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 bg-red-50 rounded-lg p-8">
        <svg className="w-16 h-16 text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-red-600 font-semibold text-lg mb-2">Error Loading KMZ</p>
        <p className="text-red-500 text-center">{error}</p>
        {onClose && (
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
          >
            Close
          </button>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 bg-gray-50 rounded-lg">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-500 border-t-transparent mb-4"></div>
        <p className="text-gray-600 text-lg">Loading KMZ file...</p>
        {debugInfo && <p className="text-gray-500 text-sm mt-2">{debugInfo}</p>}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Close button - positioned at the very top */}
      {onClose && (
        <button
          onClick={onClose}
          style={{ 
            position: 'absolute', 
            top: '16px', 
            right: '45px', 
            zIndex: 10000,
            backgroundColor: '#2c3E50',
            color: 'white',
            borderRadius: '9999px',
            padding: '12px',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#2c3E50';
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#34495E';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          aria-label="Close map"
        >
          Close Preview
        </button>
      )}
      
      <div className="bg-white rounded-lg shadow-xl overflow-hidden">
        {/* Map container with explicit height */}
        <div 
          ref={mapRef} 
          className="w-full"
          style={{ height: '600px', minHeight: '400px' }}
        />
        
        {/* Debug info overlay */}
        {debugInfo && (
          <div className="absolute bottom-4 left-4 bg-white bg-opacity-90 px-3 py-2 rounded shadow-md z-[400]">
            <p className="text-xs text-gray-600">{debugInfo}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default KmzPreview;