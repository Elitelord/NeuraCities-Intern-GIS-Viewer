import React, { useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export default function MapBackground({ activeDataset }) {
  useEffect(() => {
    const container = document.getElementById("generic-map");
    if (!container) return;

    // If a previous map exists on this container, remove it first
    if (container._leaflet_id) {
      // remove possible leftover map instance (Leaflet sometimes leaves an id)
      try {
        // eslint-disable-next-line no-underscore-dangle
        const oldMap = container._leaflet_map_instance;
        if (oldMap && oldMap.remove) oldMap.remove();
      } catch (e) {
        // ignore
      }
      // This ensures Leaflet doesn't refuse to reinitialize
      container._leaflet_id = null;
    }

    const map = L.map(container, {
      center: [20, 0],
      zoom: 2,
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      doubleClickZoom: false,
      boxZoom: false,
      touchZoom: false,
      scrollWheelZoom: false,
      keyboard: false,
      tap: false,
      // keep inertia off
      inertia: false,
    });

    // Store pointer to map instance in DOM (helps safe cleanup)
    // eslint-disable-next-line no-underscore-dangle
    container._leaflet_map_instance = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors',
      // optional: set tile opacity or other props
    }).addTo(map);

    // Disable any pointer events on the map container so underlying map won't intercept clicks
    container.style.pointerEvents = "none";

    // If dataset has bounding box, fit to bounds (bbox format must be [[minLat,minLng],[maxLat,maxLng]])
    if (activeDataset?.bbox) {
      try {
        const [[minLat, minLng], [maxLat, maxLng]] = activeDataset.bbox;
        // temporarily allow fitBounds to set view, then keep interactions disabled
        map.fitBounds([[minLat, minLng], [maxLat, maxLng]]);
      } catch (err) {
        // ignore malformed bbox
        // console.warn("Invalid bbox for dataset", activeDataset.bbox);
      }
    }

    return () => {
      map.remove();
      // eslint-disable-next-line no-underscore-dangle
      container._leaflet_map_instance = null;
    };
  }, [activeDataset]);

  return (
    <div
      id="generic-map"
      className="absolute inset-0 z-0"
      style={{ height: "100vh", width: "100%", background: "#e6eef6" }}
    />
  );
}
