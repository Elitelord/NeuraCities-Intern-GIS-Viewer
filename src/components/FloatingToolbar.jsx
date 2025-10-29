// src/components/FloatingToolbar.jsx
import React from "react";
import UnifiedLegend from "./UnifiedLegend";

/**
 * Thin wrapper around UnifiedLegend.
 * Keeps a consistent rounded container in case you want to
 * add shadows/borders or reposition later.
 */
export default function FloatingToolbar({
  datasets = [],
  active = null,
  onSelect = () => {},
  onAddNew = () => {},
  onExport = () => {},
  onRemove = () => {},
  onToggleVisible = () => {},
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: 16,
        bottom: 16,
        zIndex: 10020,
        width: 320,
        pointerEvents: "auto",
        borderRadius: 16,
      }}
    >
      <UnifiedLegend
        datasets={datasets}
        active={active}
        onSelect={onSelect}
        onAdd={onAddNew}
        onExport={onExport}
        onRemove={onRemove}
        onToggleVisible={onToggleVisible}
      />
    </div>
  );
}
