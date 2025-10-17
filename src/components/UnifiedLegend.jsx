// src/components/UnifiedLegend.jsx
import React from "react";

/** Emit style changes as window events so MapWorkspace + page state keep working */
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
  return (
    <aside
      // OPAQUE WHITE (no translucency)
      className="legend-left"
      style={{
        position: "absolute",
        left: 16,
        top: 16,
        zIndex: 10020,
        width: 320,
        maxHeight: "85vh",
        overflow: "auto",
        background: "#ffffff",          // opaque
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
        padding: 12,
      }}
    >
      {/* Datasets */}
      <div style={{ paddingBottom: 12, borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#111827" }}>Datasets</h3>
          <button
            onClick={onAdd}
            style={{ padding: "6px 8px", borderRadius: 8, background: "#eef2f7", border: "none", cursor: "pointer" }}
          >
            Add data…
          </button>
        </div>

        {datasets.length === 0 ? (
          <div style={{ fontSize: 12, color: "#6b7280" }}>No datasets loaded.</div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {datasets.map((d) => {
              const isActive = active?._id ? active._id === d._id : active?.id === d.id;
              return (
                <li
                  key={d._id || d.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: 6,
                    borderRadius: 10,
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
                      color: "#111827",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {d.label} — {d.kind}
                  </button>
                  <button
                    title="Remove dataset"
                    onClick={() => onRemove(d)}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 8,
                      background: "#e5e7eb",
                      border: "none",
                      cursor: "pointer",
                      lineHeight: "24px",
                    }}
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
              borderRadius: 10,
              border: "none",
              cursor: active ? "pointer" : "not-allowed",
              background: active ? "#0ea5e9" : "#9ca3af",
              color: "#fff",
              fontWeight: 700,
            }}
          >
            Export…
          </button>
        </div>
      </div>

      {/* Style */}
      <div style={{ paddingTop: 12 }}>
        <h4 style={{ margin: 0, marginBottom: 8, fontSize: 14, fontWeight: 700, color: "#111827" }}>
          {active ? `Style: ${active.label}` : "Style"}
        </h4>

        {!active ? (
          <div style={{ fontSize: 12, color: "#6b7280" }}>Select a dataset to style.</div>
        ) : (
          <>
            {/* Points */}
            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", margin: "6px 0" }}>Points</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <span>Color</span>
              <input type="color" onChange={(e) => emitStyle("point.color", e.target.value)} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <span>Radius</span>
              <input
                type="number"
                min="1"
                defaultValue={6}
                style={{ width: 72 }}
                onChange={(e) => emitStyle("point.radius", Number(e.target.value) || 6)}
              />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 10 }}>
              <input type="checkbox" onChange={(e) => emitStyle("connect.points", !!e.target.checked)} />
              Connect points with a line
            </label>

            {/* Lines */}
            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", margin: "6px 0" }}>Lines</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 8 }}>
              <input
                type="checkbox"
                defaultChecked
                onChange={(e) => emitStyle("line.show", !!e.target.checked)}
              />
              Show line features
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <span>Color</span>
              <input type="color" onChange={(e) => emitStyle("line.color", e.target.value)} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
              <span>Width</span>
              <input
                type="number"
                min="1"
                defaultValue={2}
                style={{ width: 72 }}
                onChange={(e) => emitStyle("line.weight", Number(e.target.value) || 2)}
              />
            </div>

            {/* Polygons */}
            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", margin: "10px 0 6px" }}>Polygons</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <span>Fill</span>
              <input type="color" onChange={(e) => emitStyle("poly.fillColor", e.target.value)} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
              <span>Fill opacity</span>
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                defaultValue={0.25}
                style={{ width: 72 }}
                onChange={(e) =>
                  emitStyle("poly.fillOpacity", Math.max(0, Math.min(1, Number(e.target.value) || 0.25)))
                }
              />
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
