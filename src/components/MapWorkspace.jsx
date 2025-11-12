// src/components/MapWorkspace.jsx
import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// safely set nested value by path, e.g. setByPath(obj, "point.color", "#ff0")
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

function parseTimeMaybe(v) {
  if (v == null) return NaN;
  if (typeof v === "number") return v; // assume epoch ms
  if (typeof v === "string") {
    const num = Number(v);
    if (!Number.isNaN(num) && v.trim() !== "") return num;
    const t = Date.parse(v);
    return Number.isNaN(t) ? NaN : t;
  }
  return NaN;
}

function buildLayerGroup(L, featureCollection, styles, filterFn) {
  const { point = {}, line = {}, poly = {} } = styles || {};
  const ptStyle = {
    radius: point.radius ?? 6,
    color: point.color ?? "#2563eb",
    strokeWidth: point.strokeWidth ?? 1,
  };
  const lnStyle = {
    color: line.color ?? "#10b981",
    width: line.width ?? 2,
    opacity: typeof line.opacity === "number" ? line.opacity : 0.9,
    dashArray: line.dash ?? null,
  };
  const pgStyle = {
    stroke: poly.stroke ?? "#334155",
    width: poly.width ?? 1.5,
    fill: poly.fill ?? "#a78bfa",
    fillOpacity:
      typeof poly.fillOpacity === "number" ? poly.fillOpacity : 0.3,
  };

  const group = L.layerGroup();

  const baseFilter = (f, types) =>
    types.includes(f?.geometry?.type) && (!filterFn || filterFn(f));

  const pts = L.geoJSON(featureCollection, {
    pointToLayer: (feat, latlng) =>
      L.circleMarker(latlng, {
        radius: ptStyle.radius,
        color: ptStyle.color,
        weight: ptStyle.strokeWidth,
        fillColor: ptStyle.color,
        fillOpacity: 0.9,
      }),
    filter: (f) => baseFilter(f, ["Point", "MultiPoint"]),
  });

  const lines = L.geoJSON(featureCollection, {
    style: () => ({
      color: lnStyle.color,
      weight: lnStyle.width,
      opacity: lnStyle.opacity,
      dashArray: lnStyle.dash,
    }),
    filter: (f) => baseFilter(f, ["LineString", "MultiLineString"]),
  });

  const polys = L.geoJSON(featureCollection, {
    style: () => ({
      color: pgStyle.stroke,
      weight: pgStyle.width,
      fillColor: pgStyle.fill,
      fillOpacity: pgStyle.fillOpacity,
    }),
    filter: (f) => baseFilter(f, ["Polygon", "MultiPolygon"]),
  });

  pts.addTo(group);
  lines.addTo(group);
  polys.addTo(group);
  return group;
}

export default function MapWorkspace({
  datasets = [],
  active = null,
  styleOptions = {},
  // NEW: only fit once, keep overview during playback
  fitOnFirstData = true,
}) {
  const mapRef = useRef(null);
  const mapEl = useRef(null);

  const baseRefs = useRef({}); // name -> base layer
  const datasetLayersRef = useRef({}); // uid -> L.LayerGroup

  const [liveStyle, setLiveStyle] = useState(styleOptions || {});
  const [timeFilter, setTimeFilter] = useState({
    field: null,
    start: null,
    end: null,
  });

  // NEW: remember if we've already auto-fitted
  const didFitRef = useRef(false);

  // Reset the fit flag if all data disappears (so next load fits once again)
  useEffect(() => {
    if (!datasets || datasets.length === 0) didFitRef.current = false;
  }, [datasets?.length]);

  // Create map once
  useEffect(() => {
    if (mapRef.current) return;
    const el = mapEl.current;
    if (!el) return;

    const map = L.map(el, {
      center: [30.2672, -97.7431],
      zoom: 11,
      preferCanvas: false,
    });
    mapRef.current = map;

    // default basemap
    const osm = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { attribution: "&copy; OpenStreetMap contributors" }
    );
    osm.addTo(map);
    baseRefs.current["OpenStreetMap"] = osm;

    // ensure vector renderer exists
    L.svg().addTo(map);

    const invalidate = () => {
      try {
        map.invalidateSize(false);
      } catch {}
    };
    invalidate();
    setTimeout(invalidate, 0);
    window.addEventListener("resize", invalidate);

    // style updates
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

    // basemap selection
    const onBasemap = (e) => {
      const { name } = (e && e.detail) || {};
      const map = mapRef.current;
      if (!map || !name) return;

      if (!baseRefs.current[name]) {
        let url = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
        if (name === "Carto Voyager")
          url =
            "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
        if (name === "Carto Positron")
          url =
            "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
        if (name === "Esri WorldImagery")
          url =
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
        baseRefs.current[name] = L.tileLayer(url, { attribution: "" });
      }

      Object.values(baseRefs.current).forEach((layer) => {
        try {
          if (map.hasLayer(layer)) map.removeLayer(layer);
        } catch {}
      });

      const layer = baseRefs.current[name];
      if (layer) layer.addTo(map);
    };
    window.addEventListener("basemap:select", onBasemap);

    // time updates (optional; kept for compatibility)
    const onTime = (e) => {
      const { field = null, start = null, end = null } = (e && e.detail) || {};
      setTimeFilter({ field, start, end });
    };
    window.addEventListener("time:update", onTime);

    return () => {
      window.removeEventListener("resize", invalidate);
      window.removeEventListener("geojson:style", onStyle);
      window.removeEventListener("basemap:select", onBasemap);
      window.removeEventListener("time:update", onTime);
      try {
        map.remove();
      } catch {}
    };
  }, []);

  // (Re)draw data layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear previous dataset groups
    Object.values(datasetLayersRef.current).forEach((g) => {
      try {
        map.removeLayer(g);
      } catch {}
    });
    datasetLayersRef.current = {};

    const visible = (datasets || []).filter(
      (d) => d && d.geojson && d.visible !== false
    );
    if (!visible.length) return;

    const activeId = active && active.uid;
    const boundsList = [];

    // optional time predicate
    let filterFn = null;
    if (timeFilter.field && timeFilter.start != null && timeFilter.end != null) {
      const start =
        typeof timeFilter.start === "number"
          ? timeFilter.start
          : Date.parse(timeFilter.start);
      const end =
        typeof timeFilter.end === "number"
          ? timeFilter.end
          : Date.parse(timeFilter.end);
      filterFn = (f) => {
        const v = f?.properties?.[timeFilter.field];
        const t = parseTimeMaybe(v);
        return !Number.isNaN(t) && t >= start && t <= end;
      };
    }

    visible.forEach((d) => {
      const styles = d.uid === activeId ? liveStyle : {};
      const group = buildLayerGroup(L, d.geojson, styles, filterFn);
      group.addTo(map);
      datasetLayersRef.current[d.uid] = group;
      try {
        const b = L.geoJSON(d.geojson).getBounds?.();
        if (b && b.isValid()) boundsList.push(b);
      } catch {}
    });

    // ▶ Fit only once (first time we have data), then never again
    if (fitOnFirstData && !didFitRef.current) {
      try {
        let fit = null;
        if (activeId && datasetLayersRef.current[activeId]) {
          fit = datasetLayersRef.current[activeId].getBounds?.();
        }
        if (!fit || !fit.isValid()) {
          fit = boundsList.reduce((acc, b) => (acc ? acc.extend(b) : b), null);
        }
        if (fit && fit.isValid()) {
          map.fitBounds(fit.pad(0.1));
          didFitRef.current = true; // mark as done
        }
      } catch {}
    }
  }, [datasets, active, liveStyle, timeFilter, fitOnFirstData]);

  return (
    <div
      ref={mapEl}
      id="generic-map"
      style={{ height: "100%", width: "100%" }}
      aria-label="Map"
    />
  );
}
