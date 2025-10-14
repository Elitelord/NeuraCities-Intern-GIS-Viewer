import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export default function MapWorkspace({ datasets = [], active = null, styleOptions = {} }) {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const connectLayerRef = useRef(null);

  const [internalActive, setInternalActive] = useState(null);
  const [internalStyle, setInternalStyle] = useState({});
  const [meta, setMeta] = useState({ hasPoints: false, hasLines: false, hasPolys: false });

  // --- Event setup (for backward compatibility) ---
  useEffect(() => {
    const onReady = (e) => setInternalActive(e.detail);
    const onStyle = (e) => {
      const { path, value } = e.detail || {};
      setInternalStyle((prev) => {
        const copy = structuredClone(prev || {});
        if (path) {
          const [group, key] = path.split(".");
          copy[group] = copy[group] || {};
          copy[group][key] = value;
        }
        return copy;
      });
    };

    // 🆕 Clear map handler
    const onClear = () => {
      if (mapRef.current) {
        if (layerRef.current) {
          mapRef.current.removeLayer(layerRef.current);
          layerRef.current = null;
        }
        if (connectLayerRef.current) {
          mapRef.current.removeLayer(connectLayerRef.current);
          connectLayerRef.current = null;
        }
      }
    };

    window.addEventListener("geojson:ready", onReady);
    window.addEventListener("geojson:style", onStyle);
    window.addEventListener("map:clear", onClear);

    return () => {
      window.removeEventListener("geojson:ready", onReady);
      window.removeEventListener("geojson:style", onStyle);
      window.removeEventListener("map:clear", onClear);
    };
  }, []);

  const effActive =
    active && (active.geojson || active.features)
      ? active.geojson
        ? active
        : { ...active, geojson: active.geojson || active }
      : internalActive;

  const effStyle =
    styleOptions && Object.keys(styleOptions).length ? styleOptions : internalStyle;

  // Init map
  useEffect(() => {
    if (mapRef.current) return;
    const map = L.map(mapEl.current, {
      center: [30.2672, -97.7431],
      zoom: 4,
      zoomControl: true,
      attributionControl: true,
    });
    mapRef.current = map;

    const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    const esri = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, attribution: "Tiles &copy; Esri" }
    );

    L.control.layers(
      { OpenStreetMap: osm, "Esri World Imagery": esri },
      null,
      { collapsed: true, position: "topright" }
    ).addTo(map);
  }, []);

  // Helpers
  const n = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const clamp01 = (v, d) => Math.max(0, Math.min(1, n(v, d)));

  const deriveLineFromPoints = (fc) => {
    const coords = [];
    for (const f of fc.features || []) {
      const type = f.geometry?.type;
      if (type === "Point") coords.push(f.geometry.coordinates);
      else if (type === "MultiPoint")
        for (const c of f.geometry.coordinates || []) coords.push(c);
    }
    if (coords.length < 2) return null;
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { derived: "connected-points" },
          geometry: { type: "LineString", coordinates: coords },
        },
      ],
    };
  };

  const styleForFeature = (feature) => {
    const t = feature?.geometry?.type;
    if (t === "Point" || t === "MultiPoint") {
      const pc = effStyle.point?.color || "#0d9488";
      return { color: pc, fillColor: pc, weight: 1, opacity: 1, fillOpacity: 0.9 };
    }
    if (t === "LineString" || t === "MultiLineString") {
      const show = effStyle.line?.show !== false;
      const lc = effStyle.line?.color || "#0d9488";
      const lw = n(effStyle.line?.weight, 2);
      return { color: lc, weight: show ? lw : 0, opacity: show ? 1 : 0 };
    }
    if (t === "Polygon" || t === "MultiPolygon") {
      const lc = effStyle.line?.color || "#0d9488";
      const lw = n(effStyle.line?.weight, 2);
      const fillCol = effStyle.poly?.fillColor || "#99f6e4";
      const fillOp = clamp01(effStyle.poly?.fillOpacity, 0.25);
      return { color: lc, weight: lw, fillColor: fillCol, fillOpacity: fillOp };
    }
    return { color: "#0d9488", weight: 2 };
  };

  // Render / refresh
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // clear previous
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (connectLayerRef.current) {
      map.removeLayer(connectLayerRef.current);
      connectLayerRef.current = null;
    }

    const activeFC = effActive?.geojson || effActive;
    if (activeFC && activeFC.type === "FeatureCollection") {
      try {
        const gj = L.geoJSON(activeFC, {
          pointToLayer: (feature, latlng) => {
            const pc = effStyle.point?.color || "#0d9488";
            const pr = n(effStyle.point?.radius, 6);
            return L.circleMarker(latlng, {
              color: pc,
              fillColor: pc,
              radius: pr,
              weight: 1,
              opacity: 1,
              fillOpacity: 0.9,
            });
          },
          style: styleForFeature,
        }).addTo(map);
        layerRef.current = gj;

        const wantConnect = !!(effStyle.connect && effStyle.connect.points);
        if (wantConnect) {
          const derived = deriveLineFromPoints(activeFC);
          if (derived) {
            const c = L.geoJSON(derived, {
              style: () => ({
                color: effStyle.line?.color || "#ef4444",
                weight: n(effStyle.line?.weight, 2),
                opacity: 1,
                fill: false,
              }),
            }).addTo(map);
            connectLayerRef.current = c;
          }
        }

        const bounds = gj.getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { maxZoom: 14, padding: [24, 24] });
      } catch (e) {
        console.warn("Failed to render active GeoJSON:", e);
      }
    }
  }, [effActive, effStyle]);

  return <div ref={mapEl} style={{ height: "100%", width: "100%" }} aria-label="Map" />;
}
