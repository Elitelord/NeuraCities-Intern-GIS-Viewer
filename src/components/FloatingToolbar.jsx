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
}) {
  return (
    <div
      style={{
        // Optional wrapper styling for consistency with the app’s rounded panels
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
      />
    </div>
  );
}
