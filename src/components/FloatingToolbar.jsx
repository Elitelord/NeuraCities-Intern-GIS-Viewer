// src/components/FloatingToolbar.jsx
import React from "react";
import UnifiedLegend from "./UnifiedLegend";

/** Thin wrapper that renders the left legend + style controls. */
export default function FloatingToolbar({
  datasets = [],
  active = null,
  onSelect = () => {},
  onAddNew = () => {},
  onExport = () => {},
  onRemove = () => {},
}) {
  return (
    <UnifiedLegend
      datasets={datasets}
      active={active}
      onSelect={onSelect}
      onAdd={onAddNew}
      onExport={onExport}
      onRemove={onRemove}
    />
  );
}
