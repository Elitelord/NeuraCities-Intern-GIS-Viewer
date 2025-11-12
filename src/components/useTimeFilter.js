// src/hooks/useTimeFilter.js
import { useEffect, useMemo, useRef, useState } from "react";

// parse to epoch ms (number | ISO string)
function toEpoch(v) {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/**
 * useTimeFilter
 * - datasets: [{ uid, geojson, visible }]
 * - selectedField: string | null   (property name holding timestamp)
 * - opts:
 *     windowSec: size of moving window in seconds (default 60)
 *     speed:     multiplier of how many windows per second to advance (default 1)
 *
 * Returns:
 *   filteredDatasets, domain [min,max], cursor, setCursor, playing, setPlaying,
 *   setSpeed(newSpeed), setWindowSec(newSec)
 */
export default function useTimeFilter(
  datasets,
  selectedField,
  opts = {}
) {
  const { windowSec = 60, speed = 1 } = opts;

  // internal, but expose setters for UI
  const [windowSizeSec, setWindowSec] = useState(windowSec);
  const [speedFactor, setSpeed] = useState(speed);

  // Build per-dataset arrays of {f, ts}
  const indexed = useMemo(() => {
    if (!selectedField) return null;
    return (datasets || []).map((d) => {
      const feats = (d?.geojson?.features || [])
        .map((f) => {
          const ts = toEpoch(f?.properties?.[selectedField]);
          return ts != null ? { f, ts } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.ts - b.ts);
      return { uid: d.uid, visible: d.visible, feats };
    });
  }, [datasets, selectedField]);

  // [min,max] across all visible features
  const domain = useMemo(() => {
    if (!indexed) return null;
    let min = Infinity,
      max = -Infinity;
    indexed.forEach((bin) =>
      bin.feats.forEach(({ ts }) => {
        if (ts < min) min = ts;
        if (ts > max) max = ts;
      })
    );
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return [min, max];
  }, [indexed]);

  // cursor = start of current window (auto-init to earliest)
  const [cursor, setCursor] = useState(null);
  useEffect(() => {
    if (domain) setCursor(domain[0]);
  }, [domain]);

  const [playing, setPlaying] = useState(false);
  const rafRef = useRef(null);

  // advance cursor while playing
  useEffect(() => {
    if (!playing || !domain || cursor == null) return;
    let last = performance.now();

    const step = (now) => {
      const dt = now - last;
      last = now;

      // Move by (window per second) * speedFactor
      const winMs = windowSizeSec * 1000;
      const delta = (dt / 1000) * (winMs * Math.max(0.1, speedFactor));

      const [min, max] = domain;
      let next = cursor + delta;
      if (next > max) next = min; // wrap

      setCursor(next);
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, domain, cursor, windowSizeSec, speedFactor]);

  // Slice features into [cursor, cursor+window]
  // src/components/useTimeFilter.js  (or wherever you placed it)

  // CUMULATIVE filter: show everything up to the current cursor
  const filtered = useMemo(() => {
    if (!indexed || !domain || cursor == null) return datasets;
    const end = cursor; // everything at or before this time stays on

    return (datasets || []).map((d) => {
      const bin = indexed.find((b) => b.uid === d.uid);
      if (!bin) return d;

      const vis = bin.feats
        .filter(({ ts }) => ts <= end)
        .map(({ f }) => f);

      return {
        ...d,
        geojson: { type: "FeatureCollection", features: vis },
      };
    });
  }, [datasets, indexed, cursor, domain]);


  return {
    filteredDatasets: filtered,
    domain,
    cursor,
    setCursor,
    playing,
    setPlaying,
    setSpeed,      // call with e.g. 0.5, 1, 2, 4
    setWindowSec,  // call with e.g. 30, 60, 300
  };
}
