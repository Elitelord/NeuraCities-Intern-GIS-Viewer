// src/components/UnifiedLegend.jsx
import React, { useEffect, useMemo, useState } from "react";

const theme = {
  primary: "#2C3E50",
  secondary: "#34495E",
  neutral: "#F5F5F5",
  white: "#FFFFFF",
  coral: "#008080",
  cta: "#FF5747",
};

/** Broadcast events to MapWorkspace */
function emitStyle(path, value) {
  try {
    window.dispatchEvent(new CustomEvent("geojson:style", { detail: { path, value } }));
  } catch {}
}
function emitToggle(layer, enabled) {
  try {
    window.dispatchEvent(new CustomEvent("overlay:toggle", { detail: { layer, enabled } }));
  } catch {}
}
function emitBasemap(name) {
  try {
    window.dispatchEvent(new CustomEvent("basemap:select", { detail: { name } }));
  } catch {}
}

export default function UnifiedLegend({
  datasets = [],
  active = null,
  onSelect = () => {},
  onAdd = () => {},
  onExport = () => {},
  onRemove = () => {}
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [layerChk, setLayerChk] = useState({ points: true, lines: true, polys: true, connect: false });
  const [baseSel, setBaseSel] = useState("OpenStreetMap");

  // normalized input box sizing (color + number inputs match)
  const inputBox = useMemo(
    () => ({
      width: 72,
      height: 36,
      borderRadius: 10,
      border: "1px solid #e5e7eb",
      padding: "0 8px",
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: 12,
      color: "#111827",
      boxSizing: "border-box",
    }),
    []
  );

  const buttonGrey = {
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "#f8fafc",
    color: "#111827",
    cursor: "pointer",
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: 12,
  };

  const card = {
    position: "absolute",
    left: 16,
    bottom: 16, // bottom-left placement
    zIndex: 10020,
    width: 320,
    maxHeight: "85vh",
    overflow: "auto",
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
    padding: 12,
    paddingTop: 8,
    fontFamily: "Arial, Helvetica, sans-serif",
    color: "#111827",
  };

  const visibleDatasets = useMemo(() => (Array.isArray(datasets) ? datasets : []), [datasets]);

  const styleBlock = `
    .legend-color {
      -webkit-appearance: none;
      -moz-appearance: none;
      appearance: none;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      width: 72px;
      height: 36px;
      padding: 0;
      cursor: pointer;
      display: inline-block;
    }
    .legend-color::-webkit-color-swatch-wrapper { padding: 0; border-radius: 10px; }
    .legend-color::-webkit-color-swatch { border: none; border-radius: 10px; }
    .legend-color::-moz-focus-inner { border: 0; padding: 0 }
  `;

  // Sync legend radio selection with map at mount
  useEffect(() => {
    emitBasemap(baseSel);
  }, [baseSel]);

  return (
    <>
      {/* Toggle button (bottom-left) */}
      {!isOpen && (
        <button
          className="btn"
          style={{ position: "absolute", left: 16, bottom: 16, zIndex: 10030 }}
          onClick={() => setIsOpen(true)}
          aria-label="Open legend and layers"
        >
          Legend & Layers
        </button>
      )}

      {isOpen && (
        <aside style={card}>
          <style>{styleBlock}</style>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 700 }}>Legend & Layers</div>
            <button className="btn" onClick={() => setIsOpen(false)} aria-label="Close legend" style={{ padding: "4px 8px" }}>
              Close
            </button>
          </div>

          {/* Datasets chooser */}
          {!!visibleDatasets.length && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Datasets</div>
              <div style={{ display: "grid", gap: 6 }}>
                {visibleDatasets.map((d) => {
                  const isActive = active && d.uid === active.uid;
                  return (
                    <button
                      key={d.uid || d.label || Math.random()}
                      onClick={() => onSelect?.(d)}
                      className="toolbar-item"
                      style={{
                        textAlign: "left",
                        padding: 6,
                        borderRadius: 8,
                        background: isActive ? theme.neutral : theme.white,
                        border: isActive ? `1px solid ${theme.coral}` : "1px solid #e5e7eb",
                      }}
                    >
                      <div style={{ fontWeight: 600, color: "#0f172a" }}>{d.label || d.name || "Dataset"}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{d.kind || d.type || "Unknown"}</div>
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="btn" onClick={() => onAdd?.()}>Add</button>
                <button className="btn" onClick={() => onExport?.()}>Export</button>
                {active && (
                  <button style={buttonGrey} onClick={() => onRemove?.(active)} title="Remove selected dataset">
                    Remove
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Overlay layer toggles */}
          <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 8, marginTop: 4 }}>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Layers</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {["points", "lines", "polys", "connect"].map((k) => (
                <label key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={!!layerChk[k]}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setLayerChk((prev) => ({ ...prev, [k]: enabled }));
                      emitToggle(k, enabled);
                    }}
                  />
                  <span style={{ textTransform: "capitalize" }}>
                    {k === "polys" ? "Polygons" : k === "connect" ? "Connect points" : k}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Point style */}
          <div style={{ borderTop: "1px solid #e5e7eb", marginTop: 12, paddingTop: 10 }}>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Point style</div>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12 }}>Color</span>
                <input type="color" className="legend-color" onChange={(e) => emitStyle("point.color", e.target.value)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12 }}>Radius</span>
                <input
                  type="number"
                  min="1"
                  defaultValue={6}
                  style={inputBox}
                  onChange={(e) => emitStyle("point.radius", Number(e.target.value) || 6)}
                />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginTop: 8 }}>
                
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
                
              </div>
            </div>
          </div>

          {/* Line style */}
          <div style={{ borderTop: "1px solid #e5e7eb", marginTop: 12, paddingTop: 10 }}>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Line style</div>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12 }}>Color</span>
                <input type="color" className="legend-color" onChange={(e) => emitStyle("line.color", e.target.value)} />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <span>Width</span>
                <input
                  type="number"
                  min="1"
                  defaultValue={3}
                  style={{ ...inputBox, width: 60 }}
                  onChange={(e) => emitStyle("line.width", Math.max(1, Number(e.target.value) || 3))}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <span>Opacity</span>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  defaultValue={1}
                  style={{ ...inputBox, width: 72 }}
                  onChange={(e) => emitStyle("line.opacity", Math.max(0, Math.min(1, Number(e.target.value) || 1)))}
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12 }}>Dash</span>
                <input
                  type="text"
                  placeholder="e.g. 4,2"
                  style={{ ...inputBox, width: 100 }}
                  onChange={(e) => emitStyle("line.dash", e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Polygon style */}
          <div style={{ borderTop: "1px solid #e5e7eb", marginTop: 12, paddingTop: 10 }}>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Polygon style</div>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12 }}>Fill</span>
                <input type="color" className="legend-color" onChange={(e) => emitStyle("poly.fill", e.target.value)} />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <span>Fill opacity</span>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  defaultValue={0.25}
                  style={{ ...inputBox, width: 72 }}
                  onChange={(e) => emitStyle("poly.fillOpacity", Math.max(0, Math.min(1, Number(e.target.value) || 0.25)))}
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12 }}>Stroke</span>
                <input type="color" className="legend-color" onChange={(e) => emitStyle("poly.stroke", e.target.value)} />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <span>Stroke width</span>
                <input
                  type="number"
                  min="0"
                  defaultValue={2}
                  style={{ ...inputBox, width: 60 }}
                  onChange={(e) => emitStyle("poly.width", Math.max(0, Number(e.target.value) || 2))}
                />
              </label>
            </div>
          </div>

          {/* Map base layers (moved to bottom) */}
          <div style={{ borderTop: "1px solid #e5e7eb", marginTop: 12, paddingTop: 10 }}>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Map</div>
            <div style={{ display: "grid", gap: 6 }}>
              {["OpenStreetMap", "Carto Voyager", "Carto Positron", "Esri WorldImagery"].map((name) => (
                <label key={name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="radio"
                    name="basemap"
                    value={name}
                    checked={baseSel === name}
                    onChange={() => {
                      setBaseSel(name);
                      emitBasemap(name);
                    }}
                  />
                  <span>{name}</span>
                </label>
              ))}
            </div>
          </div>
        </aside>
      )}
    </>
  );
}
