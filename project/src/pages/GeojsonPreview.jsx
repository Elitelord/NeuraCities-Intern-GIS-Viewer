import React, { useEffect, useRef, useState, useCallback } from 'react';

export default function GeoJsonPreview({ files, onClose }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [features, setFeatures] = useState([]);
  const [mapBounds, setMapBounds] = useState(null);
  const [leafletReady, setLeafletReady] = useState(false);
  const hasLoadedRef = useRef(false);

  const calculateBounds = useCallback((feats) => {
    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;

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
      // fallback bounds (world)
      return { north: 85, south: -85, east: 180, west: -180 };
    }
    return { north: maxLat, south: minLat, east: maxLng, west: minLng };
  }, []);

  const loadLeaflet = useCallback(() => {
    const finish = () => {
      if (!window.L) {
        setError('Leaflet failed to load.');
        setIsLoading(false);
        return;
      }
      setLeafletReady(true);
      setIsLoading(false);
    };

    if (!document.querySelector('link[href*="leaflet.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    if (!window.L && !document.querySelector('script[src*="leaflet.js"]')) {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = finish;
      script.onerror = () => { setError('Failed to load Leaflet.js'); setIsLoading(false); };
      document.head.appendChild(script);
    } else if (window.L) {
      finish();
    } else {
      setTimeout(() => (window.L ? finish() : (setError('Leaflet failed to load in time.'), setIsLoading(false))), 1000);
    }
  }, []);

  const initializeMap = useCallback(() => {
    if (!window.L || !mapRef.current || mapInstanceRef.current || features.length === 0 || !mapBounds) return;

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

      const layer = window.L.geoJSON({ type: 'FeatureCollection', features }, {
        pointToLayer: (feature, latlng) => window.L.circleMarker(latlng, {
          radius: 5, color: '#2563eb', fillColor: '#60a5fa', weight: 1, opacity: 1, fillOpacity: 0.8
        }),
        style: (feature) => {
          if (feature.geometry?.type && feature.geometry.type !== 'Point') {
            return { color: '#2563eb', weight: 2, fillColor: '#93c5fd', fillOpacity: 0.25 };
          }
        },
        onEachFeature: (feature, layer) => {
          if (feature.properties) {
            const html = Object.entries(feature.properties).map(([k, v]) => `<strong>${k}</strong>: ${v}`).join('<br/>');
            layer.bindPopup(html);
          }
        }
      }).addTo(map);

      try {
        map.fitBounds(layer.getBounds(), { padding: [20, 20] });
      } catch {
        map.setView([centerLat, centerLng], 10);
      }

      setTimeout(() => map.invalidateSize(), 100);
    } catch (err) {
      setError('Error initializing map: ' + err.message);
    }
  }, [features, mapBounds]);

  // Parse GeoJSON file
  useEffect(() => {
    if (hasLoadedRef.current) return;

    const run = async () => {
      hasLoadedRef.current = true;
      setIsLoading(true);
      setError(null);

      const file = files?.[0];
      if (!file) {
        setError('No file provided.');
        setIsLoading(false);
        return;
      }

      try {
        const text = await file.text();
        let json = JSON.parse(text);

        // Accept Feature, FeatureCollection, or raw Geometry
        let feats = [];
        if (json.type === 'FeatureCollection') {
          feats = json.features || [];
        } else if (json.type === 'Feature') {
          feats = [json];
        } else if (json.type) {
          feats = [{ type: 'Feature', properties: {}, geometry: json }];
        } else {
          throw new Error('Invalid GeoJSON structure.');
        }

        if (feats.length === 0) throw new Error('No features found.');

        const bounds = calculateBounds(feats);
        setFeatures(feats);
        setMapBounds(bounds);
        loadLeaflet();
      } catch (e) {
        setError(e.message || 'Failed to parse GeoJSON.');
        setIsLoading(false);
      }
    };

    run();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      hasLoadedRef.current = false;
    };
  }, [files, calculateBounds, loadLeaflet]);

  useEffect(() => {
    if (leafletReady && features.length > 0 && mapBounds) initializeMap();
  }, [leafletReady, features, mapBounds, initializeMap]);

  if (isLoading) return <div style={{padding:16}}>Loading GeoJSON…</div>;
  if (error) return <div style={{color:'#b91c1c', padding:16}}>Error: {error}</div>;

  // IMPORTANT: give the map a real height
  return (
    <div style={{ position:'relative', width:'100%', height:'100%', minHeight:500 }}>
      <div ref={mapRef} style={{ position:'absolute', inset:0 }} />
    </div>
  );
}
