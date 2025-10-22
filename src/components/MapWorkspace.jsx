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

// numeric parsing helpers
const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const clamp01 = (v, d) => Math.max(0, Math.min(1, num(v, d)));

// Extract a FeatureCollection from a dataset or return null
const fcFrom = (d) => {
  if (!d) return null;
  if (d.geojson && d.geojson.type === "FeatureCollection") return d.geojson;
  if (d.type === "FeatureCollection") return d;
  return null;
};

export default function MapWorkspace({ datasets = [], active = null, styleOptions = {} }) {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const baseRefs = useRef({});
  const layersCtrlRef = useRef(null);
  const overlayRefs = useRef({ points: null, lines: null, polys: null, connect: null });

  // Styles: prop + live updates via window events
  const [liveStyle, setLiveStyle] = useState(styleOptions || {});
  useEffect(() => setLiveStyle(styleOptions || {}), [styleOptions]);

  useEffect(() => {
    const onClear = () => {
      const map = mapRef.current;
      if (!map) return;
      Object.values(overlayRefs.current).forEach((lyr) => {
        if (lyr && map.hasLayer(lyr)) map.removeLayer(lyr);
      });
      overlayRefs.current = { points: null, lines: null, polys: null, connect: null };
      if (layersCtrlRef.current) {
        layersCtrlRef.current.remove();
        layersCtrlRef.current = L.control
          .layers(baseRefs.current, {}, { collapsed: true, position: "topright" })
          .addTo(map);
      }
    };
    window.addEventListener("map:clear", onClear);
    return () => window.removeEventListener("map:clear", onClear);
  }, []);
  

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

  // ✅ NEW: capture the latest FC from PreviewRouter via global event
  const [internalFC, setInternalFC] = useState(null);
  useEffect(() => {
    const onReady = (e) => {
      const fc = e?.detail?.geojson;
      if (fc && fc.type === "FeatureCollection") {
        setInternalFC(fc);
      }
    };
    window.addEventListener("geojson:ready", onReady);
    return () => window.removeEventListener("geojson:ready", onReady);
  }, []);

  // Init map + basemaps once
  useEffect(() => {
    if (mapRef.current) return;
    const map = L.map(mapEl.current, {
      center: [30.2672, -97.7431],
      zoom: 4,
      zoomControl: false,
      attributionControl: false,
    });
    mapRef.current = map;

    const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 });
    const cartoLight = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      subdomains: "abcd",
    });
    const cartoDark = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      subdomains: "abcd",
    });
    const esriImg = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19 }
    );

    baseRefs.current = {
      OSM: osm,
      "Carto Light": cartoLight,
      "Carto Dark": cartoDark,
      "ESRI Imagery": esriImg,
    };

    cartoLight.addTo(map); // default
    layersCtrlRef.current = L.control
      .layers(baseRefs.current, {}, { collapsed: true, position: "topright" })
      .addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      layersCtrlRef.current = null;
    };
  }, []);

  // Style builder per geometry
  const styleForFeature = (feature) => {
    const t = feature?.geometry?.type;
    if (t === "LineString" || t === "MultiLineString") {
      const showLines = liveStyle?.line?.show !== false;
      const lc = liveStyle?.line?.color || "#0d9488";
      const lw = num(liveStyle?.line?.weight, 2);
      return { stroke: showLines, color: lc, weight: showLines ? lw : 0, opacity: showLines ? 1 : 0, fill: false };
    }
    if (t === "Polygon" || t === "MultiPolygon") {
      const lc = liveStyle?.line?.color || "#0d9488";
      const lw = num(liveStyle?.line?.weight, 2);
      const fillCol = liveStyle?.poly?.fillColor || "#99f6e4";
      const fillOp = clamp01(liveStyle?.poly?.fillOpacity, 0.25);
      return { stroke: true, color: lc, weight: lw, opacity: 1, fill: true, fillColor: fillCol, fillOpacity: fillOp };
    }
    return { color: "#0d9488", weight: 2 };
  };

  const activeFC = useMemo(() => {
    // If something is selected, ONLY honor that selection.
    if (active) {
      const a = fcFrom(active);
      if (a) return a;
  
      // Parent passes all datasets with FCs merged.
      // If (for any reason) the active is an older object missing FC,
      // find the corresponding dataset by id and use its FC.
      const match = datasets.find(d => d.uid && active.uid && d.uid === active.uid);
      const m = fcFrom(match);
      return m || null; // <- NO “latest internal” fallback while active exists
    }
  
    // No active selection: OK to pick the first dataset that has geojson
    for (const d of datasets) {
      const f = fcFrom(d);
      if (f) return f;
    }
  
    // Lastly, when nothing is selected and nothing is loaded yet, use internalFC.
    return internalFC || null;
  }, [active, datasets, internalFC]);


  // Render/refresh overlays
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old overlays
    Object.values(overlayRefs.current).forEach((lyr) => {
      if (lyr && map.hasLayer(lyr)) map.removeLayer(lyr);
    });
    overlayRefs.current = { points: null, lines: null, polys: null, connect: null };

    // Reset layers control to basemaps only
    if (layersCtrlRef.current) {
      layersCtrlRef.current.remove();
      layersCtrlRef.current = L.control
        .layers(baseRefs.current, {}, { collapsed: true, position: "topright" })
        .addTo(map);
    }

    if (!activeFC) return;

    const points = L.geoJSON(activeFC, {
      filter: (f) => ["Point", "MultiPoint"].includes(f.geometry?.type),
      pointToLayer: (feature, latlng) => {
        const pc = liveStyle?.point?.color || "#0d9488";
        const pr = num(liveStyle?.point?.radius, 6);
        return L.circleMarker(latlng, {
          color: pc,
          fillColor: pc,
          radius: pr,
          weight: 1,
          opacity: 1,
          fillOpacity: 0.9,
        });
      },
    });

    const lines = L.geoJSON(activeFC, {
      filter: (f) => ["LineString", "MultiLineString"].includes(f.geometry?.type),
      style: styleForFeature,
    });

    const polys = L.geoJSON(activeFC, {
      filter: (f) => ["Polygon", "MultiPolygon"].includes(f.geometry?.type),
      style: styleForFeature,
    });

    let connect = null;
    if (liveStyle?.connect?.points) {
      const coords = [];
      for (const f of activeFC.features || []) {
        if (f.geometry?.type === "Point") coords.push(f.geometry.coordinates);
        if (f.geometry?.type === "MultiPoint") coords.push(...(f.geometry.coordinates || []));
      }
      if (coords.length >= 2) {
        connect = L.geoJSON(
          {
            type: "FeatureCollection",
            features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } }],
          },
          {
            style: () => ({
              stroke: true,
              color: liveStyle?.line?.color || "#ef4444",
              weight: num(liveStyle?.line?.weight, 2),
              opacity: 1,
            }),
          }
        );
      }
    }

    const added = [points, lines, polys].filter(Boolean);
    added.forEach((lyr) => lyr.addTo(map));
    if (connect) connect.addTo(map);

    const group = L.featureGroup(added);
    const b = group.getBounds();
    if (b.isValid()) map.fitBounds(b, { maxZoom: 14, padding: [24, 24] });

    const overlays = {};
    if (points) overlays["Points"] = points;
    if (lines) overlays["Lines"] = lines;
    if (polys) overlays["Polygons"] = polys;
    if (connect) overlays["Connect points"] = connect;

    layersCtrlRef.current?.remove();
    layersCtrlRef.current = L.control
      .layers(baseRefs.current, overlays, { collapsed: true, position: "topright" })
      .addTo(map);

    overlayRefs.current = { points, lines, polys, connect };
  }, [activeFC, liveStyle]);

  return <div ref={mapEl} style={{ height: "100%", width: "100%" }} aria-label="Map" />;


}
