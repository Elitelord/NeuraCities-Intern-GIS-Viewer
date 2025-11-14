// src/components/TimePlayer.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";

function fmt(ts) {
  try { return new Date(ts).toISOString().slice(0, 19).replace("T", " "); }
  catch { return String(ts); }
}
function clamp(n, a, b) { return Math.max(a, Math.min(n, b)); }

export default function TimePlayer({
  domain,
  rangeStart, rangeEnd, setRangeStart, setRangeEnd,
  playMode, setPlayMode,
  cursor, setCursor,
  playing, setPlaying,
  selectedField, setSelectedField,
  candidateFields,
  setSpeed,
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
  const enableRange = typeof setRangeStart === "function" && typeof setRangeEnd === "function";

  const baseStart = enableRange ? (rangeStart ?? min) : min;
  const baseEnd   = enableRange ? (rangeEnd   ?? max) : max;

  // visual window on the brush
  let start = baseStart;
  let end   = baseEnd;

  if (playMode === "moving" && enableRange) {
    // keep the same width as the user-defined brush and slide it with the cursor
    const width = Math.max(1, baseEnd - baseStart);
    const endPos = cursor ?? baseEnd;
    let startPos = endPos - width;

    // clamp the sliding window into the overall domain
    if (startPos < min) {
      startPos = min;
    } else if (startPos + width > max) {
      startPos = max - width;
    }

    start = startPos;
    end = startPos + width;
  } else if (playMode === "all" && enableRange) {
    // show the full timeline when in "Full timeline" mode
    start = min;
    end = max;
  }

  // brush internals
  const trackRef = useRef(null);
  const [drag, setDrag] = useState(null); // "start" | "end" | "window" | null
  const [dragStartVals, setDragStartVals] = useState([start, end]);

  const pct = (value) => ((value - min) / (max - min)) * 100;
  const valAt = (px) => {
    const rect = trackRef.current.getBoundingClientRect();
    const t = clamp((px - rect.left) / rect.width, 0, 1);
    return Math.round(min + t * (max - min));
  };

  useEffect(() => { setDragStartVals([start, end]); }, [start, end]);

  const onMouseDown = (e) => {
    if (!enableRange || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = e.clientX;
    const sx = rect.left + (pct(start) / 100) * rect.width;
    const ex = rect.left + (pct(end) / 100) * rect.width;
    const HANDLE_PAD = 10;
    const distStart = Math.abs(x - sx);
    const distEnd = Math.abs(x - ex);

    if (distStart <= HANDLE_PAD || x < sx) setDrag("start");
    else if (distEnd <= HANDLE_PAD || x > ex) setDrag("end");
    else { setDrag("window"); setDragStartVals([start, end]); }
    e.preventDefault();
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e) => {
      const val = valAt(e.clientX);
      if (drag === "start") {
        const next = clamp(val, min, end);
        setRangeStart(next);
        if (cursor != null && cursor < next) setCursor(next);
      } else if (drag === "end") {
        const next = clamp(val, start, max);
        setRangeEnd(next);
        if (cursor != null && cursor > next) setCursor(next);
      } else {
        const width = dragStartVals[1] - dragStartVals[0];
        let nextStart = clamp(val - width / 2, min, max - width);
        let nextEnd = nextStart + width;
        if (nextEnd > max) { nextEnd = max; nextStart = max - width; }
        if (nextStart < min) { nextStart = min; nextEnd = min + width; }
        setRangeStart(Math.round(nextStart));
        setRangeEnd(Math.round(nextEnd));
        const c = cursor ?? nextEnd;
        if (c < nextStart) setCursor(nextStart);
        if (c > nextEnd) setCursor(nextEnd);
      }
    };
    const up = () => setDrag(null);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [drag, start, end, min, max, cursor, dragStartVals, setCursor, setRangeStart, setRangeEnd]);

  // keep cursor in-bounds when switching mode
  useEffect(() => {
    if (!domain) return;
    if (playMode === "window" && enableRange) {
      const lo = start, hi = end;
      setCursor((c) => (c == null ? lo : clamp(c, lo, hi)));
    } else {
      setCursor((c) => (c == null ? min : clamp(c, min, max)));
    }
  }, [playMode, enableRange, start, end, min, max, domain, setCursor]);

  // small helper for segmented buttons
  const Seg = ({ value, label }) => (
    <button
      onClick={() => setPlayMode(value)}
      className="btn"
      style={{
        padding: "4px 10px",
        borderRadius: 6,
        border: "1px solid #cbd5e1",
        background: playMode === value ? "#0ea5e9" : "#fff",
        color: playMode === value ? "#fff" : "#0f172a",
        fontFamily: "Montserrat, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ padding: 8 }}>
      {/* row 1: title + play */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ fontWeight: 600 }}>Time</div>
        <button
          onClick={() => setPlaying(p => !p)}
          className="btn"
          style={{
            padding: "4px 10px",
            fontFamily: "Montserrat, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          }}
        >
          {playing ? "Pause" : "Play"}
        </button>
      </div>

      {/* row 2: field picker */}
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

      {/* row 3: brush timeline */}
      {enableRange && (
        <div style={{ marginTop: 10 }}>
          <div
            ref={trackRef}
            onMouseDown={onMouseDown}
            role="slider"
            aria-label="Time frame"
            style={{
              position: "relative",
              height: 24,
              borderRadius: 6,
              background: "#e5e7eb",
              overflow: "hidden",
              userSelect: "none",
              cursor: drag ? "grabbing" : "default",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: `${pct(start)}%`,
                width: `${Math.max(0, pct(end) - pct(start))}%`,
                top: 0, bottom: 0,
                background: "#60a5fa",
                opacity: 0.9,
              }}
            />
            <div style={{
              position: "absolute", left: `calc(${pct(start)}% - 6px)`, top: -2,
              width: 12, height: 28, borderRadius: 4, background: "#fff",
              border: "1px solid #94a3b8", boxShadow: "0 1px 2px rgba(0,0,0,0.15)", cursor: "ew-resize",
            }}/>
            <div style={{
              position: "absolute", left: `calc(${pct(end)}% - 6px)`, top: -2,
              width: 12, height: 28, borderRadius: 4, background: "#fff",
              border: "1px solid #94a3b8", boxShadow: "0 1px 2px rgba(0,0,0,0.15)", cursor: "ew-resize",
            }}/>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4, color: "#475569" }}>
            <span>{fmt(start)}</span>
            <span>{fmt(end)}</span>
          </div>
        </div>
      )}

      {/* row 4: scope toggle (stacked for clarity) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
        <Seg value="all" label="Full timeline" />
        <Seg value="window" label="Fixed window" />
        <Seg value="moving" label="Moving window" />
      </div>

      {/* row 5: scrubber */}
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

      {/* row 6: speeds on their own line */}
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        <button
          className="btn"
          onClick={() => setSpeed(0.25)}
          style={{ fontFamily: "Montserrat, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
        >
          0.25×
        </button>
        <button
          className="btn"
          onClick={() => setSpeed(0.5)}
          style={{ fontFamily: "Montserrat, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
        >
          0.5×
        </button>
        <button
          className="btn"
          onClick={() => setSpeed(1)}
          style={{ fontFamily: "Montserrat, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
        >
          1×
        </button>
        <button
          className="btn"
          onClick={() => setSpeed(2)}
          style={{ fontFamily: "Montserrat, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
        >
          2×
        </button>
        <button
          className="btn"
          onClick={() => setSpeed(4)}
          style={{ fontFamily: "Montserrat, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
        >
          4×
        </button>
        <button
          className="btn"
          onClick={() => setSpeed(8)}
          style={{ fontFamily: "Montserrat, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
        >
          8×
        </button>
      </div>
    </div>
  );
}
