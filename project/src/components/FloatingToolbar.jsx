import React from "react";

export default function FloatingToolbar({
  datasets,
  active,
  onSelect,
  onAddNew,
  onExport,
}) {
  return (
    <div className="absolute bottom-6 left-6 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-2xl shadow-lg z-30 p-4 w-72">
      <h4 className="font-semibold text-sm text-gray-700 mb-2">Datasets</h4>

      <div className="space-y-1 max-h-40 overflow-y-auto mb-3">
        {datasets.map((d, i) => (
          <button
            key={i}
            onClick={() => onSelect(d)}
            className={`btn w-full text-left ${
              active?.label === d.label
                ? "bg-teal-600 text-white"
                : "bg-gray-50 text-gray-800 hover:bg-gray-100"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <button onClick={onAddNew} className="btn bg-gray-200 text-gray-700 hover:bg-gray-300">
          Upload New
        </button>
        <button onClick={onExport} className="btn bg-teal-600 text-white hover:bg-teal-700">
          Export
        </button>
      </div>
    </div>
  );
}
