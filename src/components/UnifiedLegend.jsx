// src/components/UnifiedLegend.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

/** Broadcast style updates so MapWorkspace can react */
function emitStyle(path, value) {
  try {
    window.dispatchEvent(new CustomEvent("geojson:style", { detail: { path, value } }));
  } catch {}
}

export default function UnifiedLegend({
  datasets = [],
  active = null,
  onSelect = () => {},
  onAdd = () => {},
  onRemove = () => {},
  onExport = () => {},
}) {
  const [openStyle, setOpenStyle] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // floating panel position (draggable)
  const [pos, setPos] = useState({ x: 360, y: 80 });
  const dragState = useRef({ dragging: false, offsetX: 0, offsetY: 0 });

  useEffect(() => {
    const onMove = (e) => {
      if (!dragState.current.dragging) return;
      setPos((p) => ({ x: e.clientX - dragState.current.offsetX, y: e.clientY - dragState.current.offsetY }));
    };
    const onUp = () => (dragState.current.dragging = false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

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
    top: 16,
    zIndex: 10020,
    width: 320,
    maxHeight: "85vh",
    overflow: "auto",
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 16, // consistent rounded corners
    boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
    padding: 12,
    fontFamily: "Arial, Helvetica, sans-serif", // match globals.css
    color: "#111827",
  };

  // 🔧 exact size match for <input type="color"> using a scoped class
  const colorCss = `
    .legend-color {
      width: 72px;
      height: 36px;
      border-radius: 10px;
      border: 1px solid #e5e7eb;
      padding: 0;
      box-sizing: border-box;
      background: none;
      appearance: none;
      -webkit-appearance: none;
      -moz-appearance: none;
      cursor: pointer;
      display: inline-block;
    }
    /* Remove inner padding/border of the native swatch on WebKit */
    .legend-color::-webkit-color-swatch-wrapper {
      padding: 0;
      border-radius: 10px;
    }
    .legend-color::-webkit-color-swatch {
      border: none;
      border-radius: 10px;
    }
    /* Firefox */
    .legend-color::-moz-focus-inner {
      border: 0;
      padding: 0;
    }
    .legend-color::-moz-color-swatch {
      border: none;
      border-radius: 10px;
    }
  `;

  return (
    <aside style={card}>
      <style>{colorCss}</style>

      {/* Data list */}
      <div style={{ paddingBottom: 12, borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Datasets</h3>
          <button onClick={onAdd} style={{ ...buttonGrey, padding: "6px 8px" }}>
            Add data…
          </button>
        </div>

        {datasets.length === 0 ? (
          <div style={{ fontSize: 12, color: "#6b7280" }}>No datasets loaded.</div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {datasets.map((d, i) => {
              // pick a stable identity, in priority order
              const key = d.uid;
              const activeKey = active?.uid ?? null;
              const isActive = activeKey != null && activeKey === d.uid;

              return (
                <li
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: 6,
                    borderRadius: 12,
                    background: isActive ? "#f0fdf4" : "#f8fafc",
                    outline: isActive ? "1px solid #86efac" : "none",
                    marginBottom: 6,
                  }}
                >
                  <button
                    onClick={() => onSelect(d)}
                    title={`${d.label} — ${d.kind}`}
                    style={{
                      flex: 1,
                      textAlign: "left",
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      color: "#111827",
                      fontFamily: "Arial, Helvetica, sans-serif",
                    }}
                  >
                    {d.label} — {d.kind}
                  </button>
                  <button
                    title="Remove dataset"
                    onClick={() => onRemove(d)}
                    style={{ width: 28, height: 28, borderRadius: 10, background: "#e5e7eb", border: "none", cursor: "pointer" }}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
          <button
            disabled={!active}
            onClick={() => active && onExport(active)}
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              border: "none",
              cursor: active ? "pointer" : "not-allowed",
              background: active ? "#0ea5e9" : "#9ca3af",
              color: "#fff",
              fontWeight: 700,
              fontFamily: "Arial, Helvetica, sans-serif",
              fontSize: 12,
            }}
          >
            Export…
          </button>
          <button
            disabled={!active}
            onClick={() => setOpenStyle(true)}
            style={{ ...buttonGrey, opacity: active ? 1 : 0.6 }}
            title="Open style panel"
          >
            Style…
          </button>
        </div>
      </div>

      {/* Minimal legend text (actual controls in floating panel) */}
      <div style={{ paddingTop: 12 }}>
        <h4 style={{ margin: 0, marginBottom: 8, fontSize: 14, fontWeight: 700 }}>
          {active ? `Legend: ${active.label}` : "Legend"}
        </h4>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Use the Style button to adjust symbology (points, lines, polygons). Toggle layers in the map control.
        </div>
      </div>

      {/* Floating Style Panel (draggable, collapsible) */}
      {openStyle && (
        <div
          style={{
            position: "fixed",
            left: Math.max(8, Math.min(pos.x, window.innerWidth - 440)),
            top: Math.max(8, Math.min(pos.y, window.innerHeight - (collapsed ? 64 : 520))),
            zIndex: 10040,
            width: 420,
            maxWidth: "90vw",
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            overflow: "hidden",
            fontFamily: "Arial, Helvetica, sans-serif",
            color: "#111827",
          }}
        >
          {/* Header (drag handle) */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 10,
              cursor: "move",
              background: "#f8fafc",
              borderBottom: "1px solid #e5e7eb",
              fontFamily: "Arial, Helvetica, sans-serif",
            }}
            onMouseDown={(e) => {
              const rect = e.currentTarget.parentElement.getBoundingClientRect();
              dragState.current.dragging = true;
              dragState.current.offsetX = e.clientX - rect.left;
              dragState.current.offsetY = e.clientY - rect.top;
            }}
            onDoubleClick={() => setCollapsed((c) => !c)} // quick collapse/expand
            title="Drag to move • Double-click to collapse/expand"
          >
            <div style={{ fontWeight: 800, fontSize: 14 }}>
              Style options{active ? ` — ${active.label}` : ""}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setCollapsed((c) => !c)} style={buttonGrey} title="Collapse / Expand">
                {collapsed ? "Expand" : "Collapse"}
              </button>
              <button onClick={() => setOpenStyle(false)} style={buttonGrey} title="Close">
                Close
              </button>
            </div>
          </div>

          {/* Body */}
          {!collapsed && (
            <div style={{ padding: 16 }}>
              {!active ? (
                <div style={{ fontSize: 12, color: "#6b7280" }}>Select a dataset on the left.</div>
              ) : (
                <div style={{ display: "grid", rowGap: 14 }}>
                  {/* Points */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Points</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 12 }}>Color</span>
                      <input
                        type="color"
                        className="legend-color"
                        onChange={(e) => emitStyle("point.color", e.target.value)}
                      />
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
                      <input type="checkbox" onChange={(e) => emitStyle("connect.points", !!e.target.checked)} /> Connect points with a line
                    </label>
                  </div>

                  {/* Lines */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Lines</div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 8 }}>
                      <input type="checkbox" defaultChecked onChange={(e) => emitStyle("line.show", !!e.target.checked)} /> Show line features
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 12 }}>Color</span>
                      <input
                        type="color"
                        className="legend-color"
                        onChange={(e) => emitStyle("line.color", e.target.value)}
                      />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 12 }}>Width</span>
                      <input
                        type="number"
                        min="1"
                        defaultValue={2}
                        style={inputBox}
                        onChange={(e) => emitStyle("line.weight", Number(e.target.value) || 2)}
                      />
                    </div>
                  </div>

                  {/* Polygons */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Polygons</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 12 }}>Fill</span>
                      <input
                        type="color"
                        className="legend-color"
                        onChange={(e) => emitStyle("poly.fillColor", e.target.value)}
                      />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 12 }}>Fill opacity</span>
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        defaultValue={0.25}
                        style={inputBox}
                        onChange={(e) =>
                          emitStyle("poly.fillOpacity", Math.max(0, Math.min(1, Number(e.target.value) || 0.25)))
                        }
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
