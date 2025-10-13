// src/components/MapWorkspace.jsx
import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * MapWorkspace
 * - Renders a Leaflet basemap that fills its container.
 * - Stays "dumb": no upload/preview/export UI here.
 *
 * Props (optional, future-friendly):
 *  - datasets: Array of dataset objects (unused here, but you can use it later)
 *  - active:   The currently selected dataset. If it includes `geojson`,
 *              we render it as a layer.
 *
 * Expected parent layout:
 *  - Parent gives this component full size (e.g. `.map-root { position:absolute; inset:0 }`)
 */
export default function MapWorkspace({ datasets = [], active = null }) {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  // Create the map once
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;

    const map = L.map(mapEl.current, { zoomControl: true }).setView([20, 0], 2);
    mapRef.current = map;

    // Light basemap
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      {
        attribution: "© OpenStreetMap contributors © CARTO",
        subdomains: "abcd",
        maxZoom: 19,
      }
    ).addTo(map);

    // Ensure proper sizing after mount
    setTimeout(() => map.invalidateSize(), 50);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Optionally render the active dataset as GeoJSON if provided
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // remove previous layer
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    // If parent passes a normalized GeoJSON on `active.geojson`, draw it
    if (active && active.geojson) {
      try {
        const gj = L.geoJSON(active.geojson, {
          style: { color: "#0d9488", weight: 2 },
        }).addTo(map);
        layerRef.current = gj;

        // Fit to bounds (guard against empty/malformed data)
        const b = gj.getBounds();
        if (b.isValid()) {
          map.fitBounds(b, { maxZoom: 14, padding: [24, 24] });
        }
      } catch (e) {
        // If parsing fails, we keep the basemap only
        // eslint-disable-next-line no-console
        console.warn("Failed to render active GeoJSON:", e);
      }
    }
  }, [active]);

  return (
    <div
      ref={mapEl}
      style={{ height: "100%", width: "100%" }} // must fill parent container
      aria-label="Map"
    />
  );
}
