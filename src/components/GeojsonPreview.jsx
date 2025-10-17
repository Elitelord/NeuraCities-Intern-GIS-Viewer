// src/components/GeojsonPreview.jsx
import React, { useEffect, useRef, useState } from "react";

/**
 * GeojsonPreview
 * - Parses uploaded GeoJSON and emits FeatureCollection via onConvert(...) and 'geojson:ready'.
 * - If hideInlineUI is true, no visible UI is rendered (still parses & dispatches).
 */
export default function GeojsonPreview({ files, onConvert, onStyleChange, hideInlineUI = false }) {
  const [fileLabel, setFileLabel] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    (async () => {
      try {
        setIsLoading(true);
        const file = files?.[0];
        if (!file) throw new Error("No file provided");

        setFileLabel(file.name || "dataset.geojson");
        const text = await file.text();
        const parsed = JSON.parse(text);

        const fc =
          parsed.type === "FeatureCollection"
            ? parsed
            : { type: "FeatureCollection", features: parsed.features || [] };

        onConvert?.(fc);
        try {
          window.dispatchEvent(
            new CustomEvent("geojson:ready", { detail: { label: file.name, geojson: fc } })
          );
        } catch {}
      } catch (e) {
        setError(e?.message || String(e));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [files, onConvert]);

  if (hideInlineUI) return null;

  // If you want to keep a minimal status box on the right while debugging, you can leave this.
  // For a truly single-legend experience, you could also `return null` here always.
  return (
    <div
      style={{
        position: "absolute",
        right: 16,
        top: 16,
        zIndex: 10010,
        background: "rgba(255,255,255,0.95)",
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
        padding: 8,
        fontSize: 12,
      }}
    >
      {isLoading ? "Parsing…" : error ? `Error: ${error}` : `Previewing ${fileLabel}`}
    </div>
  );
}
