import React, { useState } from "react";

const theme = {
  primary: "#2C3E50",
  secondary: "#34495E",
  neutral: "#F5F5F5",
  white: "#FFFFFF",
  coral: "#008080",
  cta: "#FF5747",
};

const FONT_STACK =
  "'Montserrat', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif";

function emitStyle(path, value) {
  try {
    window.dispatchEvent(new CustomEvent("geojson:style", { detail: { path, value } }));
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
  onRemove = () => {},
  onToggleVisible = () => {},
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [styleOpen, setStyleOpen] = useState(true);
  const [baseSel, setBaseSel] = useState("OpenStreetMap");

  const card = {
    position: "absolute",
    left: 16,
    bottom: 16,
    zIndex: 10020,
    width: 320,
    maxHeight: "85vh",
    overflow: "auto",
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    boxShadow: "0 10px 30px rgba(2,6,23,0.12)",
    padding: 12,
    fontFamily: FONT_STACK,
  };

  const inputBox = {
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    padding: "4px 6px",
    background: "#fff",
    fontFamily: FONT_STACK,
  };

  const FIELD_SIZE = { width: 60, height: 36, boxSizing: "border-box" };


  const reopenBtn = {
    position: "absolute",
    left: 16,
    bottom: 16,
    zIndex: 10020,
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    background: "#fff",
    cursor: "pointer",
    boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
    padding: "6px 10px",
    fontFamily: FONT_STACK,
    color: "#0f172a",
  };

  return (
    <>
      {isOpen ? (
        <aside style={card} className="pointer-events-auto">
          {/* --- Header --- */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontWeight: 700,
              color: "#0f172a",
              marginBottom: 10,
              fontFamily: FONT_STACK,
            }}
          >
            <div>Legend & Style</div>
            <button
              onClick={() => setIsOpen(false)}
              aria-label="Close legend"
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
                fontFamily: FONT_STACK,
              }}
            >
              ×
            </button>
          </div>

          <div style={{ color: "#475569", fontSize: 12, fontFamily: FONT_STACK }}>
            Upload → convert to GeoJSON → render. Toggle or remove layers below.
          </div>

          {/* --- Dataset list --- */}
          {datasets?.length > 0 && (
            <div style={{ marginBottom: 10, marginTop: 8 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <div style={{ fontSize: 12, color: "#64748b", fontFamily: FONT_STACK }}>
                  Legend
                </div>
                <button
                  className="btn"
                  onClick={() => onAdd?.()}
                  aria-label="Add dataset"
                  style={{ fontFamily: FONT_STACK }}
                >
                  Add
                </button>
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {datasets.map((d) => {
                  const isActive = active && d.uid === active.uid;
                  const visible = d.visible !== false;
                  return (
                    <div
                      key={d.uid}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "24px 1fr 28px",
                        gap: 8,
                        alignItems: "center",
                        padding: 6,
                        borderRadius: 8,
                        background: isActive ? theme.neutral : theme.white,
                        border: isActive
                          ? `1px solid ${theme.coral}`
                          : "1px solid #e5e7eb",
                        fontFamily: FONT_STACK,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={visible}
                        onChange={(e) => onToggleVisible?.(d, e.target.checked)}
                      />
                      <button
                        onClick={() => onSelect?.(d)}
                        style={{
                          textAlign: "left",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontFamily: FONT_STACK,
                        }}
                      >
                        <div style={{ fontWeight: 600, color: "#0f172a" }}>
                          {d.label || d.name || "Dataset"}
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>
                          {d.kind || d.type || (d.geojson ? "GeoJSON" : d.ext || "Unknown")}
                        </div>
                      </button>
                      <button
                        onClick={() => onRemove?.(d)}
                        aria-label="Remove dataset"
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          border: "1px solid #e5e7eb",
                          background: "#fff",
                          cursor: "pointer",
                          fontFamily: FONT_STACK,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* --- Symbology section --- */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 6,
              marginTop: 8,
            }}
          >
            <div style={{ fontSize: 12, color: "#64748b", fontFamily: FONT_STACK }}>
              Symbology
            </div>
            <button
              onClick={() => setStyleOpen((o) => !o)}
              aria-label="Toggle symbology"
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
                fontFamily: FONT_STACK,
              }}
            >
              {styleOpen ? "−" : "+"}
            </button>
          </div>

          {/* ✅ FIXED: conditional block restored */}
          {styleOpen && (
            <div style={{ fontFamily: FONT_STACK }}>
              {/* Point */}
              <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 10 }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Point style</div>
                <div style={{ display: "grid", gap: 8 }}>
                  <label style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Color</span>
                    <input
                      type="color"
                      style={{ ...inputBox, ...FIELD_SIZE, padding: 0}}
                      onChange={(e) => emitStyle("point.color", e.target.value)}
                    />
                  </label>
                  <label style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Radius</span>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      defaultValue={6}
                      style={{ ...inputBox, ...FIELD_SIZE }}
                      onChange={(e) =>
                        emitStyle("point.radius", Math.max(1, Number(e.target.value) || 6))
                      }
                    />
                  </label>
                </div>
              </div>

              {/* Line */}
              <div style={{ borderTop: "1px solid #e5e7eb", marginTop: 12, paddingTop: 10 }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Line style</div>
                <div style={{ display: "grid", gap: 8 }}>
                  <label style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Color</span>
                    <input
                      type="color"
                      style={{ ...inputBox, ...FIELD_SIZE, padding: 0}}
                      onChange={(e) => emitStyle("line.color", e.target.value)}
                    />
                  </label>
                  <label style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Width</span>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      defaultValue={2}
                      style={{ ...inputBox, ...FIELD_SIZE}}
                      onChange={(e) =>
                        emitStyle("line.width", Math.max(1, Number(e.target.value) || 2))
                      }
                    />
                  </label>
                </div>
              </div>

              {/* Polygon */}
              <div style={{ borderTop: "1px solid #e5e7eb", marginTop: 12, paddingTop: 10 }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Polygon style</div>
                <div style={{ display: "grid", gap: 8 }}>
                  <label style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Fill</span>
                    <input
                      type="color"
                      style={{ ...inputBox, ...FIELD_SIZE, padding: 0}}
                      onChange={(e) => emitStyle("poly.fill", e.target.value)}
                    />
                  </label>
                  <label style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Stroke</span>
                    <input
                      type="color"
                      style={{ ...inputBox, ...FIELD_SIZE, padding: 0 }}
                      onChange={(e) => emitStyle("poly.stroke", e.target.value)}
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* --- Map base layers --- */}
          <div
            style={{
              borderTop: "1px solid #e5e7eb",
              marginTop: 12,
              paddingTop: 10,
              fontFamily: FONT_STACK,
            }}
          >
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Map</div>
            <div style={{ display: "grid", gap: 6 }}>
              {["OpenStreetMap", "Carto Voyager", "Carto Positron", "Esri WorldImagery"].map(
                (name) => (
                  <label
                    key={name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontFamily: FONT_STACK,
                    }}
                  >
                    <input
                      type="radio"
                      name="basemap"
                      checked={baseSel === name}
                      onChange={() => {
                        setBaseSel(name);
                        emitBasemap(name);
                      }}
                    />
                    <span>{name}</span>
                  </label>
                )
              )}
            </div>
          </div>
        </aside>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          style={reopenBtn}
          aria-label="Open legend"
          title="Open Legend"
        >
          Legend ☰
        </button>
      )}
    </>
  );
}
