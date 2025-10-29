// src/components/MapWorkspace.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Helper: safely set nested value by path, e.g. setByPath(obj, "point.color", "#ff0")
function setByPath(target, path, value) {
  if (!path || typeof path !== "string") return;
  const parts = path.split(".");
  let cur = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (!cur[k] || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}

// Convert styleOptions to concrete style for each geometry
function toPointStyle(styleOptions = {}) {
  const { point = {} } = styleOptions;
  return {
    color: point.color || "#2563eb",
    radius: point.radius || 6,
    strokeWidth: point.strokeWidth || 1,
  };
}
function toLineStyle(styleOptions = {}) {
  const { line = {} } = styleOptions;
  return {
    color: line.color || "#10b981",
    width: line.width || 2,
    opacity: typeof line.opacity === "number" ? line.opacity : 0.9,
    dashArray: line.dash || null,
  };
}
function toPolyStyle(styleOptions = {}) {
  const { poly = {} } = styleOptions;
  return {
    stroke: poly.stroke || "#334155",
    width: poly.width || 1.5,
    fill: poly.fill || "#a78bfa",
    fillOpacity: typeof poly.fillOpacity === "number" ? poly.fillOpacity : 0.3,
  };
}

function buildLayerGroup(L, featureCollection, styles) {
  const { point = {}, line = {}, poly = {} } = styles || {};
  const ptStyle = {
    radius: point.radius ?? 6,
    color: point.color ?? "#2563eb",
    strokeWidth: point.strokeWidth ?? 1,
  };
  const lnStyle = {
    color: line.color ?? "#10b981",
    width: line.width ?? 2,
    opacity: line.opacity ?? 0.9,
    dash: line.dash ?? null,
  };
  const pgStyle = {
    stroke: poly.stroke ?? "#334155",
    width: poly.width ?? 1.5,
    fill: poly.fill ?? "#a78bfa",
    fillOpacity: poly.fillOpacity ?? 0.3,
  };
  const group = L.layerGroup();
  const pts = L.geoJSON(featureCollection, {
    pointToLayer: (feat, latlng) =>
      L.circleMarker(latlng, {
        radius: ptStyle.radius,
        color: ptStyle.color,
        weight: ptStyle.strokeWidth,
        fillColor: ptStyle.color,
        fillOpacity: 0.9,
      }),
    filter: (f) => f?.geometry?.type === "Point" || f?.geometry?.type === "MultiPoint",
  });
  const lines = L.geoJSON(featureCollection, {
    style: () => ({ color: lnStyle.color, weight: lnStyle.width, opacity: lnStyle.opacity, dashArray: lnStyle.dash }),
    filter: (f) => f?.geometry?.type === "LineString" || f?.geometry?.type === "MultiLineString",
  });
  const polys = L.geoJSON(featureCollection, {
    style: () => ({ color: pgStyle.stroke, weight: pgStyle.width, fillColor: pgStyle.fill, fillOpacity: pgStyle.fillOpacity }),
    filter: (f) => f?.geometry?.type === "Polygon" || f?.geometry?.type === "MultiPolygon",
  });
  pts.addTo(group); lines.addTo(group); polys.addTo(group);
  return group;
}

export default function MapWorkspace({ datasets = [], active = null, styleOptions = {} }) {
  const mapRef = useRef(null);
  const mapEl = useRef(null);

  const baseRefs = useRef({}); // base tile layers (name -> layer)
  const overlayRefs = useRef({ points: null, lines: null, polys: null, connect: null });
  const datasetLayersRef = useRef({}); // uid -> L.LayerGroup
  const layersCtrlRef = useRef(null);

  const [internalFC, setInternalFC] = useState(null);
  const [liveStyle, setLiveStyle] = useState(styleOptions || {});

  // Overlay visibility (legend checkboxes)
  const [overlayVisible, setOverlayVisible] = useState({
    points: true,
    lines: true,
    polys: true,
    connect: false,
  });

  // Handle overlay toggle events from legend (kept for geometry layers if you ever re-enable)
  useEffect(() => {
    const onToggle = (e) => {
      const { layer, enabled } = (e && e.detail) || {};
      if (!layer) return;
      setOverlayVisible((prev) => ({ ...prev, [layer]: enabled }));
      const map = mapRef.current;
      const refs = overlayRefs.current;
      if (!map || !refs) return;
      const lyr = refs[layer];
      if (!lyr) return;
      try {
        if (enabled) {
          if (!map.hasLayer(lyr)) lyr.addTo(map);
        } else {
          if (map.hasLayer(lyr)) map.removeLayer(lyr);
        }
      } catch {}
    };
    window.addEventListener("overlay:toggle", onToggle);
    return () => window.removeEventListener("overlay:toggle", onToggle);
  }, []);

  // Handle basemap selection events
  useEffect(() => {
    const onBasemap = (e) => {
      const { name } = (e && e.detail) || {};
      const map = mapRef.current;
      if (!map || !name) return;
      // Create tiles lazily
      if (!baseRefs.current[name]) {
        let url = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
        if (name === "Carto Voyager") url = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
        if (name === "Carto Positron") url = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
        if (name === "Esri WorldImagery") url = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

        baseRefs.current[name] = L.tileLayer(url, { attribution: "" });
      }
      // Remove the existing base layer (first/only tile layer on map)
      Object.values(baseRefs.current).forEach((layer) => {
        try {
          if (map.hasLayer(layer)) map.removeLayer(layer);
        } catch {}
      });
      // Add selected base layer
      const layer = baseRefs.current[name];
      if (layer) {
        layer.addTo(map);
      }
    };
    window.addEventListener("basemap:select", onBasemap);

    return () => {
      window.removeEventListener("basemap:select", onBasemap);
    };
  }, []);

  // Create map on mount
  useEffect(() => {
    if (mapRef.current) return;
    const map = L.map(mapEl.current, {
      center: [30.2672, -97.7431],
      zoom: 11,
    });
    mapRef.current = map;

    // default basemap
    const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "" });
    osm.addTo(map);

    // listen for style updates to apply live to active dataset
    const onStyle = (e) => {
      const { path, value } = (e && e.detail) || {};
      if (!path) return;
      setLiveStyle((prev) => {
        const next = { ...prev };
        setByPath(next, path, value);
        return next;
      });
    };
    window.addEventListener("geojson:style", onStyle);

    // cleanup
    return () => {
      window.removeEventListener("geojson:style", onStyle);
      map.remove();
    };
  }, []);

  // (Re)draw overlays from all visible datasets; active uses liveStyle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove previous dataset groups
    Object.values(datasetLayersRef.current).forEach((g) => {
      try { map.removeLayer(g); } catch {}
    });
    datasetLayersRef.current = {};

    const visible = (datasets || []).filter(d => d && d.geojson && (d.visible !== false));
    if (!visible.length) return;

    const activeId = active && active.uid;
    const boundsList = [];

    visible.forEach(d => {
      const styles = d.uid === activeId ? liveStyle : {};
      const group = buildLayerGroup(L, d.geojson, styles);
      group.addTo(map);
      datasetLayersRef.current[d.uid] = group;
      try {
        const b = L.geoJSON(d.geojson).getBounds();
        if (b && b.isValid()) boundsList.push(b);
      } catch {}
    });

    // Fit bounds (prefer active)
    try {
      let fit = null;
      if (activeId && datasetLayersRef.current[activeId]) {
        fit = datasetLayersRef.current[activeId].getBounds?.();
      }
      if (!fit || !fit.isValid()) {
        fit = boundsList.reduce((acc, b) => (acc ? acc.extend(b) : b), null);
      }
      if (fit && fit.isValid()) map.fitBounds(fit.pad(0.1));
    } catch {}
  }, [datasets, active, liveStyle]);

  return <div ref={mapEl} style={{ height: "100%", width: "100%" }} aria-label="Map" />;
}
