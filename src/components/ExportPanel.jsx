// (your existing file; only changed the close button label)
import React from "react";

export default function ExportPanel({ onClose = () => {}, datasets = [] }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.4)",
        display: "grid",
        placeItems: "center",
        zIndex: 10030,
      }}
    >
      <div style={{ width: 560, maxWidth: "90vw", background: "#fff", borderRadius: 16, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Export</div>
          <button className="btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* ... keep the rest of your existing export UI unchanged ... */}
        <div style={{ fontSize: 14 }}>
          {/* existing code */}
        </div>
      </div>
    </div>
  );
}
