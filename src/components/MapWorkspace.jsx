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

// Style helpers
// theme palette
const theme = {
  primary: "#2C3E50",
  secondary: "#34495E",
  neutral: "#F5F5F5",
  white: "#FFFFFF",
  coral: "#008080",
  cta: "#FF5747",
};

// then in the style helpers:
function toPointStyle(opt = {}) {
  const color = opt?.point?.color ?? theme.coral;
  const radius = opt?.point?.radius ?? 6;
  const stroke = opt?.point?.stroke ?? theme.white;
  const strokeWidth = opt?.point?.strokeWidth ?? 1.5;
  return { color, radius, stroke, strokeWidth };
}

function toLineStyle(opt = {}) {
  const color = opt?.line?.color ?? theme.primary;
  const width = opt?.line?.width ?? 3;
  const dash = opt?.line?.dash ?? "";
  const opacity = opt?.line?.opacity ?? 1;
  return { color, width, dash, opacity };
}

function toPolyStyle(opt = {}) {
  const fill = opt?.poly?.fill ?? theme.coral;
  const fillOpacity = opt?.poly?.fillOpacity ?? 0.25;
  const stroke = opt?.poly?.stroke ?? theme.primary;
  const width = opt?.poly?.width ?? 2;
  return { fill, fillOpacity, stroke, width };
}


// Build a feature collection from a dataset (if it already has geojson, use that)
function fcFrom(d) {
  if (!d) return null;
  if (d.geojson && d.geojson.type === "FeatureCollection") return d.geojson;
  if (d.geojson && d.geojson.type && d.geojson.type !== "FeatureCollection") {
    return { type: "FeatureCollection", features: [{ type: "Feature", geometry: d.geojson, properties: {} }] };
  }
  return null;
}

export default function MapWorkspace({ datasets = [], active = null, styleOptions = {} }) {
  const mapRef = useRef(null);
  const mapEl = useRef(null);

  const baseRefs = useRef({}); // base tile layers (name -> layer)
  const overlayRefs = useRef({ points: null, lines: null, polys: null, connect: null });
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

  // Handle overlay toggle events from legend
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
      if (enabled) {
        if (!map.hasLayer(lyr)) lyr.addTo(map);
      } else {
        if (map.hasLayer(lyr)) map.removeLayer(lyr);
      }
    };
    window.addEventListener("overlay:toggle", onToggle);
    return () => window.removeEventListener("overlay:toggle", onToggle);
  }, []);

  // Live style updates from legend
  useEffect(() => {
    const onStyle = (e) => {
      if (!e?.detail) return;
      setLiveStyle((prev) => {
        const next = JSON.parse(JSON.stringify(prev || {}));
        setByPath(next, e.detail.path, e.detail.value);
        return next;
      });
    };
    window.addEventListener("geojson:style", onStyle);
    return () => window.removeEventListener("geojson:style", onStyle);
  }, []);

  // Handle external clear (if used)
  useEffect(() => {
    const onClear = () => {
      const map = mapRef.current;
      if (!map) return;
      Object.values(overlayRefs.current).forEach((lyr) => {
        if (lyr && map.hasLayer(lyr)) map.removeLayer(lyr);
      });
      overlayRefs.current = { points: null, lines: null, polys: null, connect: null };
      /* Layer control removed in onClear */
    };
    window.addEventListener("map:clear", onClear);
    return () => window.removeEventListener("map:clear", onClear);
  }, []);

  // merge styleOptions prop into liveStyle whenever prop changes
  useEffect(() => setLiveStyle((prev) => ({ ...prev, ...styleOptions })), [styleOptions]);

  // Choose active FeatureCollection
  const activeFC = useMemo(() => {
    if (active) {
      const a = fcFrom(active);
      if (a) return a;
      const match = datasets.find((d) => d.uid && active.uid && d.uid === active.uid);
      const m = fcFrom(match);
      return m || null;
    }
    for (const d of datasets) {
      const f = fcFrom(d);
      if (f) return f;
    }
    return internalFC || null;
  }, [active, datasets, internalFC]);

  // Init map and base layers
  useEffect(() => {
    if (mapRef.current || !mapEl.current) return;

    const map = L.map(mapEl.current, { center: [30.2672, -97.7431], zoom: 10, zoomControl: false,
      attributionControl: false });
    mapRef.current = map;

    // Define base maps (all created, but only default is added)
    const bases = {
      "OpenStreetMap": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
        subdomains: "abc",
      }),
      "Carto Voyager": L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        {
          maxZoom: 20,
          attribution: "&copy; OpenStreetMap &copy; CARTO",
          subdomains: "abcd",
        }
      ),
      "Carto Positron": L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png",
        {
          maxZoom: 20,
          attribution: "&copy; OpenStreetMap &copy; CARTO",
          subdomains: "abcd",
        }
      ),
      "Esri WorldImagery": L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 20, attribution: "Tiles &copy; Esri" }
      ),
    };
    baseRefs.current = bases;

    // Add default base
    bases["OpenStreetMap"].addTo(map);

    // Listen for basemap changes from legend
    const onBasemap = (e) => {
      const name = e?.detail?.name;
      if (!name || !baseRefs.current[name]) return;
      Object.entries(baseRefs.current).forEach(([n, layer]) => {
        if (n === name) {
          if (!map.hasLayer(layer)) layer.addTo(map);
        } else {
          if (map.hasLayer(layer)) map.removeLayer(layer);
        }
      });
    };
    window.addEventListener("basemap:select", onBasemap);

    return () => {
      window.removeEventListener("basemap:select", onBasemap);
    };
  }, []);

  // (Re)draw overlays from activeFC + liveStyle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove existing overlay layers
    Object.values(overlayRefs.current).forEach((lyr) => {
      if (lyr && map.hasLayer(lyr)) map.removeLayer(lyr);
    });
    overlayRefs.current = { points: null, lines: null, polys: null, connect: null };

    if (!activeFC) return;
    const ptStyle = toPointStyle(liveStyle);
    const lnStyle = toLineStyle(liveStyle);
    const pgStyle = toPolyStyle(liveStyle);

    const points = L.geoJSON(activeFC, {
      pointToLayer: (feat, latlng) =>
        L.circleMarker(latlng, {
          radius: ptStyle.radius,
          color: ptStyle.color,
          weight: ptStyle.strokeWidth,
          fillColor: ptStyle.color,
          fillOpacity: 0.9,
        }),
      filter: (f) => f?.geometry?.type === "Point" || f?.geometry?.type === "MultiPoint",
    }).addTo(map);

    const lines = L.geoJSON(activeFC, {
      style: () => ({ color: lnStyle.color, weight: lnStyle.width, opacity: lnStyle.opacity, dashArray: lnStyle.dash }),
      filter: (f) => f?.geometry?.type === "LineString" || f?.geometry?.type === "MultiLineString",
    }).addTo(map);

    const polys = L.geoJSON(activeFC, {
      style: () => ({ color: pgStyle.stroke, weight: pgStyle.width, fillColor: pgStyle.fill, fillOpacity: pgStyle.fillOpacity }),
      filter: (f) =>
        f?.geometry?.type === "Polygon" ||
        f?.geometry?.type === "MultiPolygon",
    }).addTo(map);

    // Optional: connect points (simple polyline across point centroids)
    let connect = null;
    try {
      const pts = [];
      activeFC.features?.forEach((feat) => {
        if (feat?.geometry?.type === "Point" && Array.isArray(feat.geometry.coordinates)) {
          const [x, y] = feat.geometry.coordinates;
          pts.push([y, x]);
        }
      });
      if (pts.length > 1) {
        connect = L.polyline(pts, {
          color: lnStyle.color,
          weight: lnStyle.width,
          opacity: lnStyle.opacity,
          dashArray: lnStyle.dash,
        });
        connect.addTo(map);
      }
    } catch {}

    // Respect visibility toggles
    if (!overlayVisible.points && map.hasLayer(points)) map.removeLayer(points);
    if (!overlayVisible.lines && map.hasLayer(lines)) map.removeLayer(lines);
    if (!overlayVisible.polys && map.hasLayer(polys)) map.removeLayer(polys);
    if (connect && !overlayVisible.connect && map.hasLayer(connect)) map.removeLayer(connect);

    // Remove Leaflet UI layer control in favor of UnifiedLegend toggles
    layersCtrlRef.current?.remove();
    /* Layer control removed in favor of UnifiedLegend toggles */

    overlayRefs.current = { points, lines, polys, connect };

    // Fit bounds to data
    try {
      const b = L.geoJSON(activeFC).getBounds();
      if (b && b.isValid()) map.fitBounds(b.pad(0.1));
    } catch {}
  }, [activeFC, liveStyle, overlayVisible]);

  return <div ref={mapEl} style={{ height: "100%", width: "100%" }} aria-label="Map" />;
}
