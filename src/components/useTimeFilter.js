// src/hooks/useTimeFilter.js
import { useEffect, useMemo, useRef, useState } from "react";

function toEpoch(v) {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/**
 * Adds playMode:
 *  - "all": ignore brush for playback + filtering (whole domain)
 *  - "window": use [rangeStart, rangeEnd] for playback + filtering
 */
export default function useTimeFilter(datasets, selectedField, opts = {}) {
  const { windowSec = 60, speed = 1 } = opts;
  const [windowSizeSec, setWindowSec] = useState(windowSec);
  const [speedFactor, setSpeed] = useState(speed);

  // NEW: play scope
  const [playMode, setPlayMode] = useState("window"); // default to window (kepler-like)

  // index timestamps
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

  const domain = useMemo(() => {
    if (!indexed) return null;
    let min = Infinity, max = -Infinity;
    indexed.forEach((bin) => bin.feats.forEach(({ ts }) => {
      if (ts < min) min = ts;
      if (ts > max) max = ts;
    }));
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return [min, max];
  }, [indexed]);

  // brush
  const [rangeStart, setRangeStart] = useState(null);
  const [rangeEnd, setRangeEnd] = useState(null);
  useEffect(() => {
    if (!domain) { setRangeStart(null); setRangeEnd(null); return; }
    const [dmin, dmax] = domain;
    setRangeStart((p) => (p == null ? dmin : Math.max(dmin, Math.min(p, dmax))));
    setRangeEnd((p) => (p == null ? dmax : Math.max(dmin, Math.min(p, dmax))));
  }, [domain]);

  // cursor
  const [cursor, setCursor] = useState(null);
  useEffect(() => { if (domain) setCursor(domain[0]); }, [domain]);

  // keep cursor bounded appropriately for current mode
  useEffect(() => {
    if (!domain) return;
    const [dmin, dmax] = domain;
    setCursor((c) => {
      if (c == null) return c;
      if (playMode === "window" && rangeStart != null && rangeEnd != null) {
        return Math.max(rangeStart, Math.min(c, rangeEnd));
      }
      return Math.max(dmin, Math.min(c, dmax));
    });
  }, [playMode, rangeStart, rangeEnd, domain]);

  const [playing, setPlaying] = useState(false);
  const rafRef = useRef(null);

  // advance cursor respecting mode
  useEffect(() => {
    if (!playing || !domain || cursor == null) return;
    let last = performance.now();
    const step = (now) => {
      const dt = now - last; last = now;
      const winMs = windowSizeSec * 1000;
      const delta = (dt / 1000) * (winMs * Math.max(0.1, speedFactor));

      const [dmin, dmax] = domain;
      const endCap = playMode === "window"
        ? (rangeEnd ?? dmax)
        : dmax;

      let next = cursor + delta;
      if (next > endCap) next = endCap;

      setCursor(next);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, domain, cursor, windowSizeSec, speedFactor, playMode, rangeEnd]);

  // filtering (cumulative up to cursor) in chosen scope
  const filtered = useMemo(() => {
    if (!indexed || !domain) return datasets;

    const [dmin, dmax] = domain;
    const lo = playMode === "window" ? (rangeStart ?? dmin) : dmin;
    const hi = playMode === "window" ? (rangeEnd ?? dmax) : dmax;
    const cutoff = cursor ?? hi;

    return (datasets || []).map((d) => {
      const bin = indexed.find((b) => b.uid === d.uid);
      if (!bin) return d;
      const vis = bin.feats
        .filter(({ ts }) => ts >= lo && ts <= hi)
        .filter(({ ts }) => ts <= cutoff)
        .map(({ f }) => f);
      return { ...d, geojson: { type: "FeatureCollection", features: vis } };
    });
  }, [datasets, indexed, domain, rangeStart, rangeEnd, cursor, playMode]);

  return {
    filteredDatasets: filtered,
    domain,
    rangeStart, rangeEnd, setRangeStart, setRangeEnd,
    cursor, setCursor,
    playing, setPlaying,
    setSpeed, setWindowSec,
    playMode, setPlayMode,            // ← expose new toggle
  };
}
