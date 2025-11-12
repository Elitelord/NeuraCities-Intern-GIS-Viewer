// src/components/TimePlayer.jsx
import React from "react";

function fmt(ts) {
  try { return new Date(ts).toISOString().slice(0, 19).replace("T", " "); }
  catch { return String(ts); }
}

export default function TimePlayer({
  domain,
  cursor,
  setCursor,
  playing,
  setPlaying,
  selectedField,
  setSelectedField,
  candidateFields,
  setSpeed,      // still used
  // setWindowSec // no longer used in cumulative mode
}) {
  if (!domain) {
    return (
      <div style={{ padding: 8 }}>
        <div style={{ fontWeight: 600 }}>Time</div>
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
          Choose the timestamp property to enable playback.
        </div>
        <select
          value={selectedField || ""}
          onChange={(e) => setSelectedField(e.target.value || null)}
          style={{ width: "100%" }}
        >
          <option value="">— choose time property —</option>
          {candidateFields.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>
    );
  }

  const [min, max] = domain;

  return (
    <div style={{ padding: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ fontWeight: 600 }}>Time</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setPlaying(p => !p)} className="btn" style={{ padding: "4px 10px" }}>
            {playing ? "Pause" : "Play"}
          </button>
          {/* Speed presets */}
          <button className="btn" onClick={() => setSpeed(0.5)}>0.5×</button>
          <button className="btn" onClick={() => setSpeed(1)}>1×</button>
          <button className="btn" onClick={() => setSpeed(2)}>2×</button>
          <button className="btn" onClick={() => setSpeed(4)}>4×</button>
        </div>
      </div>

      {/* field picker */}
      <div style={{ marginTop: 6 }}>
        <select
          value={selectedField || ""}
          onChange={(e) => setSelectedField(e.target.value || null)}
          style={{ width: "100%" }}
        >
          <option value="">— choose time property —</option>
          {candidateFields.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      {/* scrubber from min..max; cursor defines "show all up to here" */}
      <input
        type="range"
        min={min}
        max={max}
        value={cursor ?? min}
        onChange={(e) => setCursor(Number(e.target.value))}
        style={{ width: "100%", marginTop: 10 }}
      />

      <div style={{ fontSize: 12, display: "flex", justifyContent: "space-between" }}>
        <span>{fmt(min)}</span>
        <span>{fmt(cursor ?? min)}</span>
        <span>{fmt(max)}</span>
      </div>
    </div>
  );
}
