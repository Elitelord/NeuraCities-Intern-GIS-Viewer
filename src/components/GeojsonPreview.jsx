import React, { useEffect, useRef, useState, useCallback } from 'react';

// GeoJsonPreview.jsx — generalized map preview
// Features added:
// - Multiple basemap providers + basemap switcher
// - Layer management (toggle overlays)
// - Styling UI for points/lines/polygons (color/size/width/dash/fill/opacity)
// - Popups/tooltips for features
// - Basic controls: zoom, pan, fullscreen (element-level fullscreen API)
// Note: This file continues to use dynamic Leaflet script/css injection like other preview files

export default function GeoJsonPreview({ files, onClose }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const geoJsonLayerRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [features, setFeatures] = useState([]);
  const [mapBounds, setMapBounds] = useState(null);
  const [leafletReady, setLeafletReady] = useState(false);
  const hasLoadedRef = useRef(false);

  // UI state for basemap + styling + layer toggles
  const [baseMap, setBaseMap] = useState('carto_light');
  const [overlaysVisible, setOverlaysVisible] = useState(true);
  const [pointStyle, setPointStyle] = useState({ color: '#2563eb', radius: 6, shape: 'circle' });
  const [lineStyle, setLineStyle] = useState({ color: '#2563eb', weight: 2, dash: '' });
  const [polygonStyle, setPolygonStyle] = useState({ fillColor: '#93c5fd', fillOpacity: 0.25, color: '#2563eb', weight: 2 });

  // --- Helpers ---
  const calculateBounds = useCallback((feats) => {
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;

    const walk = (coords) => {
      if (!coords) return;
      if (typeof coords[0] === 'number') {
        const [lng, lat] = coords;
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          minLat = Math.min(minLat, lat);
          maxLat = Math.max(maxLat, lat);
          minLng = Math.min(minLng, lng);
          maxLng = Math.max(maxLng, lng);
        }
      } else {
        coords.forEach(walk);
      }
    };

    feats.forEach(f => f?.geometry?.coordinates && walk(f.geometry.coordinates));

    if (!isFinite(minLat) || !isFinite(minLng) || !isFinite(maxLat) || !isFinite(maxLng)) {
      return { north: 85, south: -85, east: 180, west: -180 };
    }
    return { north: maxLat, south: minLat, east: maxLng, west: minLng };
  }, []);

  const finishLeafletLoad = useCallback(() => {
    if (!window.L) {
      setError('Leaflet failed to load.');
      setIsLoading(false);
      return;
    }
    setLeafletReady(true);
    setIsLoading(false);
  }, []);

  const loadLeaflet = useCallback(() => {
    if (!document.querySelector('link[href*="leaflet.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    if (!window.L && !document.querySelector('script[src*="leaflet.js"]')) {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = finishLeafletLoad;
      script.onerror = () => { setError('Failed to load Leaflet.js'); setIsLoading(false); };
      document.head.appendChild(script);
    } else if (window.L) finishLeafletLoad();
    else setTimeout(() => (window.L ? finishLeafletLoad() : (setError('Leaflet failed to load in time.'), setIsLoading(false))), 800);
  }, [finishLeafletLoad]);

  // Create or update basemap tile layer
  const getBasemapLayer = useCallback((key) => {
    if (!window.L) return null;
    const L = window.L;
    switch (key) {
      case 'osm':
        return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' });
      case 'esri_imagery':
        return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri' });
      case 'stamen_terrain':
        return L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/terrain/{z}/{x}/{y}.jpg', { subdomains: 'abcd', attribution: 'Map tiles by Stamen' });
      case 'carto_dark':
        return L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© CARTO' });
      case 'carto_light':
      default:
        return L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '© OpenStreetMap contributors © CARTO', subdomains: 'abcd' });
    }
  }, []);

  // Apply styles and (re)create geojson overlay
  const createOrUpdateGeoJsonLayer = useCallback(() => {
    if (!window.L || !leafletMapRef.current) return;
    const L = window.L;

    // Remove existing
    if (geoJsonLayerRef.current) {
      try { leafletMapRef.current.removeLayer(geoJsonLayerRef.current); } catch (e) {}
      geoJsonLayerRef.current = null;
    }

    if (!overlaysVisible) return;

    const opts = {
      pointToLayer: (feature, latlng) => {
        const s = pointStyle;
        return L.circleMarker(latlng, {
          radius: Number(s.radius) || 6,
          color: s.color,
          fillColor: s.color,
          weight: 1,
          opacity: 1,
          fillOpacity: 0.9
        });
      },
      style: (feature) => {
        if (!feature.geometry) return {};
        const t = feature.geometry.type;
        if (t === 'Polygon' || t === 'MultiPolygon') {
          return {
            color: polygonStyle.color,
            weight: polygonStyle.weight,
            fillColor: polygonStyle.fillColor,
            fillOpacity: Number(polygonStyle.fillOpacity)
          };
        }
        if (t === 'LineString' || t === 'MultiLineString') {
          return {
            color: lineStyle.color,
            weight: Number(lineStyle.weight) || 2,
            dashArray: lineStyle.dash || null
          };
        }
        return {};
      },
      onEachFeature: (feature, layer) => {
        // Tooltip on hover
        const title = feature.properties && (feature.properties.name || feature.properties.id || feature.properties.label);
        if (title) layer.bindTooltip(String(title));

        // Popup with full properties
        if (feature.properties) {
          const html = Object.entries(feature.properties)
            .map(([k,v]) => `<strong>${k}</strong>: ${v}`)
            .join('<br/>');
          layer.bindPopup(html);
        }
      }
    };

    try {
      geoJsonLayerRef.current = L.geoJSON({ type: 'FeatureCollection', features }, opts).addTo(leafletMapRef.current);
    } catch (err) {
      console.warn('Could not create GeoJSON layer', err);
    }
  }, [features, overlaysVisible, pointStyle, lineStyle, polygonStyle]);

  // Initialize or update map instance
  const initializeMap = useCallback(() => {
    if (!window.L || !mapRef.current || leafletMapRef.current) return;
    const L = window.L;

    try {
      const map = L.map(mapRef.current, { zoomControl: false, attributionControl: true }).setView([0,0], 2);
      leafletMapRef.current = map;

      // Add default basemap
      const base = getBasemapLayer(baseMap);
      if (base) base.addTo(map);

      // Add zoom control (top-right)
      L.control.zoom({ position: 'topright' }).addTo(map);

      // Fit bounds if present
      if (mapBounds) {
        const centerLat = (mapBounds.north + mapBounds.south) / 2;
        const centerLng = (mapBounds.east + mapBounds.west) / 2;
        try {
          map.fitBounds([[mapBounds.south, mapBounds.west], [mapBounds.north, mapBounds.east]], { padding: [20,20] });
        } catch {
          map.setView([centerLat, centerLng], 10);
        }
      }

      createOrUpdateGeoJsonLayer();

      // when map is destroyed, cleanup refs
      map.on('unload', () => {
        try { leafletMapRef.current = null; } catch (e) {}
      });

      // ensure proper size
      setTimeout(() => map.invalidateSize(), 100);
    } catch (err) {
      setError('Error initializing map: ' + err.message);
    }
  }, [baseMap, getBasemapLayer, mapBounds, createOrUpdateGeoJsonLayer]);

  // ---------------- File parsing ----------------
  useEffect(() => {
    // removed hasLoadedRef guard so uploads can re-run parsing every time files change
    console.log('[GeoJsonPreview] files changed:', files && files.length ? files.map(f => f.name).join(', ') : 'no files');
    const run = async () => {
      hasLoadedRef.current = true;
      setIsLoading(true);
      setError(null);

      const file = files?.[0];
      if (!file) { setError('No file provided.'); setIsLoading(false); return; }

      try {
        const text = await file.text();
        const json = JSON.parse(text);

        // Accept FeatureCollection / Feature / Geometry
        let feats = [];
        if (json.type === 'FeatureCollection') feats = json.features || [];
        else if (json.type === 'Feature') feats = [json];
        else if (json.type) feats = [{ type: 'Feature', properties: {}, geometry: json }];
        else throw new Error('Invalid GeoJSON');

        if (!feats.length) throw new Error('No features found');

        const valid = feats.filter(f => f && f.geometry && f.geometry.coordinates);
        if (!valid.length) throw new Error('No features with coordinates');

        const bounds = calculateBounds(valid);
        setFeatures(valid);
        // debug helpers
        try { window.__DEBUG_RAW_TEXT__ = text; } catch(e){}
        window.__DEBUG_FEATURE_COUNT__ = valid.length;
        console.log('[GeoJsonPreview] parsed features:', valid.length, 'bounds:', bounds);
        setMapBounds(bounds);
        loadLeaflet();
      } catch (e) {
        setError(e.message || 'Failed to parse GeoJSON');
        setIsLoading(false);
      }
    };

    run();

    return () => {
      if (leafletMapRef.current) {
        try { leafletMapRef.current.remove(); } catch (e) {}
        leafletMapRef.current = null;
      }
      hasLoadedRef.current = false;
    };
  }, [files, calculateBounds, loadLeaflet]);

  // Initialize when Leaflet ready and we have features
  useEffect(() => {
    if (leafletReady && features.length > 0 && mapRef.current && !leafletMapRef.current) initializeMap();
  }, [leafletReady, features, initializeMap]);

  // Recreate GeoJSON layer when styles or overlays toggle change
  useEffect(() => {
    if (!leafletMapRef.current) return;
    createOrUpdateGeoJsonLayer();
    // fit to layer bounds if present
    if (geoJsonLayerRef.current) {
      try { leafletMapRef.current.fitBounds(geoJsonLayerRef.current.getBounds(), { padding: [20,20] }); } catch (e) {}
    }
  }, [createOrUpdateGeoJsonLayer]);

  // Change basemap
  useEffect(() => {
    if (!leafletMapRef.current) return;
    // remove all tile layers (naive)
    leafletMapRef.current.eachLayer((layer) => {
      if (layer && layer.options && layer.options.attribution !== undefined && !(layer instanceof window.L.GeoJSON)) {
        try { leafletMapRef.current.removeLayer(layer); } catch (e) {}
      }
    });
    const base = getBasemapLayer(baseMap);
    if (base) base.addTo(leafletMapRef.current);
  }, [baseMap, getBasemapLayer]);

  // Fullscreen toggling using Fullscreen API on the container
  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  // UI event handlers (simple)
  const handlePointStyleChange = (k, v) => setPointStyle(prev => ({ ...prev, [k]: v }));
  const handleLineStyleChange = (k, v) => setLineStyle(prev => ({ ...prev, [k]: v }));
  const handlePolygonStyleChange = (k, v) => setPolygonStyle(prev => ({ ...prev, [k]: v }));

  // ---------------- Render ----------------
  if (isLoading) return <div style={{ padding: 16 }}>Loading GeoJSON…</div>;
  if (error) return <div style={{ color: '#b91c1c', padding: 16 }}>Error: {error}</div>;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 500 }}>
      {/* Top-left control panel */}
      <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 1000, background: 'rgba(255,255,255,0.95)', padding: 10, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
        <div style={{ marginBottom: 8, fontWeight: 600 }}>Basemap</div>
        <select value={baseMap} onChange={e => setBaseMap(e.target.value)} style={{ width: 220 }}>
          <option value="carto_light">Carto Light (default)</option>
          <option value="osm">OpenStreetMap</option>
          <option value="esri_imagery">Esri World Imagery (satellite)</option>
          <option value="stamen_terrain">Topographic (Stamen Terrain)</option>
          <option value="carto_dark">Carto Dark</option>
        </select>

        <div style={{ height: 8 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={overlaysVisible} onChange={e => setOverlaysVisible(e.target.checked)} />
          Show dataset layer
        </label>

        <div style={{ height: 8 }} />
        <button onClick={toggleFullscreen} style={{ padding: '6px 10px', borderRadius: 6 }}>Toggle Fullscreen</button>
      </div>

      {/* Styling panel (top-right) */}
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 1000, background: 'rgba(255,255,255,0.95)', padding: 10, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.12)', width: 300 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Style settings</div>

        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>Point</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <input type="color" value={pointStyle.color} onChange={e => handlePointStyleChange('color', e.target.value)} title="Point color" />
            <input type="number" min={1} max={50} value={pointStyle.radius} onChange={e => handlePointStyleChange('radius', e.target.value)} style={{ width: 70 }} />
            <select value={pointStyle.shape} onChange={e => handlePointStyleChange('shape', e.target.value)}>
              <option value="circle">Circle</option>
              <option value="square">Square</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>Line</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <input type="color" value={lineStyle.color} onChange={e => handleLineStyleChange('color', e.target.value)} />
            <input type="number" min={1} max={20} value={lineStyle.weight} onChange={e => handleLineStyleChange('weight', e.target.value)} style={{ width: 70 }} />
            <input placeholder="dash e.g. 6 4" value={lineStyle.dash} onChange={e => handleLineStyleChange('dash', e.target.value)} style={{ flex: 1 }} />
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>Polygon</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
            <input type="color" value={polygonStyle.fillColor} onChange={e => handlePolygonStyleChange('fillColor', e.target.value)} />
            <input type="color" value={polygonStyle.color} onChange={e => handlePolygonStyleChange('color', e.target.value)} title="Border color" />
            <input type="number" min={0} max={1} step={0.05} value={polygonStyle.fillOpacity} onChange={e => handlePolygonStyleChange('fillOpacity', e.target.value)} style={{ width: 70 }} />
            <input type="number" min={1} max={20} value={polygonStyle.weight} onChange={e => handlePolygonStyleChange('weight', e.target.value)} style={{ width: 70 }} />
          </div>
        </div>
      </div>

      {/* Info badge bottom-left */}
      <div style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 1000, background: 'rgba(255,255,255,0.9)', padding: '8px 10px', borderRadius: 8 }}>
        <div style={{ fontSize: 12 }}><strong>{features.length}</strong> features</div>
      </div>

      {/* map container */}
      <div id="geojson-preview-map" ref={mapRef} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, height: '100%' }} />
    </div>
  );
}
