import React, { useEffect, useRef, useState } from 'react';

/**
 * GeojsonPreview
 * - Parses uploaded GeoJSON & emits FeatureCollection via onConvert() or 'geojson:ready'.
 * - Header (Previewing … · Hide/Show style · Close preview) + style panel.
 * - Right-edge launcher tabs:
 *    • If style is hidden -> "Style" tab to reopen the panel
 *    • If preview is closed -> "Preview" tab to reopen everything
 * - Shows only controls relevant to loaded geometry types:
 *    • Points: when point features exist
 *    • Lines: when line features exist OR you want to style the derived connect-points line
 *    • Polygons: only when polygon features exist
 */
export default function GeoJsonPreview({ files, onConvert, onStyleChange }) {
  const [visible, setVisible] = useState(true);      // header + panel visibility
  const [showPanel, setShowPanel] = useState(true);  // style panel visibility
  const [fileLabel, setFileLabel] = useState('');
  const hasLoadedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState('');
  const [meta, setMeta] = useState({ hasPoints: false, hasLines: false, hasPolys: false });

  const stop = {
    onMouseDown: e => e.stopPropagation(),
    onMouseUp: e => e.stopPropagation(),
    onClick: e => e.stopPropagation(),
    onWheel: e => e.stopPropagation(),
    onTouchStart: e => e.stopPropagation(),
    onTouchMove: e => e.stopPropagation(),
    onTouchEnd: e => e.stopPropagation(),
  };

  const emitStyle = (path, value) => {
    if (typeof onStyleChange === 'function') onStyleChange(path, value);
    else if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('geojson:style', { detail: { path, value } }));
    }
  };

  // Parse once
  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    (async () => {
      setIsLoading(true);
      setError(null);
      setInfo('Parsing GeoJSON…');

      try {
        const file = files?.[0];
        if (!file) throw new Error('No file provided.');
        setFileLabel(file.name || 'dataset');

        const text = await file.text();
        let json;
        try { json = JSON.parse(text); } catch { throw new Error('Invalid JSON. Could not parse.'); }

        let features = [];
        if (json.type === 'FeatureCollection') {
          features = Array.isArray(json.features) ? json.features : [];
        } else if (json.type === 'Feature') {
          features = [json];
        } else if (json && json.type) {
          features = [{ type: 'Feature', properties: {}, geometry: json }];
        } else {
          throw new Error('File is not valid GeoJSON/Feature/FeatureCollection.');
        }

        const valid = features.filter(
          f => f && f.type === 'Feature' && f.geometry && f.geometry.coordinates
        );
        if (!valid.length) throw new Error('No valid features with coordinates found.');

        const types = new Set(valid.map(f => f.geometry?.type));
        const hasPoints = [...types].some(t => t === 'Point' || t === 'MultiPoint');
        const hasLines  = [...types].some(t => t === 'LineString' || t === 'MultiLineString');
        const hasPolys  = [...types].some(t => t === 'Polygon' || t === 'MultiPolygon');
        setMeta({ hasPoints, hasLines, hasPolys });

        const fc = { type: 'FeatureCollection', features: valid };
        setInfo(`Loaded ${valid.length} feature(s). Previewing on main map.`);

        if (typeof onConvert === 'function') onConvert(fc);
        else if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('geojson:ready', {
            detail: { label: file.name, geojson: fc, meta: { hasPoints, hasLines, hasPolys } }
          }));
        }

        setIsLoading(false);
      } catch (e) {
        setError(e?.message || 'Failed to parse GeoJSON.');
        setIsLoading(false);
      }
    })();
  }, [files, onConvert]);

  // Close all preview UI (header + panel) but keep a launcher to reopen
  const closeAll = () => {
    setVisible(false);
    setShowPanel(false);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('preview:closed', { detail: { label: fileLabel } }));
    }
  };

  // Right-edge launcher tab (always accessible)
  const Launcher = ({ label, onClick }) => (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        right: 0,
        transform: 'translateY(-50%)',
        zIndex: 10015,
        pointerEvents: 'auto'
      }}
      {...stop}
    >
      <button
        onClick={onClick}
        aria-label={`Open ${label}`}
        style={{
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
          background: 'rgba(255,255,255,0.98)',
          border: '1px solid #e5e7eb',
          borderRight: 'none',
          borderTopLeftRadius: 10,
          borderBottomLeftRadius: 10,
          padding: '10px 8px',
          boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
          cursor: 'pointer',
          fontWeight: 600,
          color: '#111827'
        }}
      >
        {label}
      </button>
    </div>
  );

  if (!visible) {
    return (
      <Launcher
        label="Preview"
        onClick={() => {
          setVisible(true);
          setShowPanel(false); // user decides to open style
        }}
      />
    );
  }

  const section = (t) => (
    <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', marginTop: 10 }}>{t}</div>
  );
  const row = { display: 'flex', alignItems: 'center', fontSize: 12, color: '#334155', marginTop: 8 };
  const pad = { marginLeft: 8 };

  // Whether to render the Lines section:
  const showLinesSection = meta.hasLines || meta.hasPoints; // style real lines or derived line

  return (
    <>
      {/* Header */}
      <div
        style={{ position: 'absolute', top: 12, right: 12, zIndex: 10030, pointerEvents: 'auto' }}
        {...stop}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,255,255,0.98)', border: '1px solid #e5e7eb',
            borderRadius: 12, boxShadow: '0 8px 20px rgba(0,0,0,0.12)', padding: '8px 10px'
          }}
        >
          <div style={{ fontWeight: 700, color: '#111827', marginRight: 6 }}>
            Previewing <span style={{ opacity: 0.8 }}>{fileLabel}</span>
          </div>
          <button
            onClick={() => setShowPanel(s => !s)}
            style={{ border: '1px solid #d1d5db', background: '#f3f4f6', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}
          >
            {showPanel ? 'Hide style' : 'Show style'}
          </button>
          <button
            onClick={closeAll}
            style={{ border: '1px solid #d1d5db', background: '#e5e7eb', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}
          >
            Close preview
          </button>
        </div>
      </div>

      {/* When style panel is hidden, show a "Style" launcher on the right edge */}
      {!showPanel && (
        <Launcher
          label="Style"
          onClick={() => setShowPanel(true)}
        />
      )}

      {/* Style panel */}
      {showPanel && (
        <div
          style={{ position: 'absolute', top: 72, right: 16, zIndex: 10020, maxWidth: 320, pointerEvents: 'auto' }}
          {...stop}
        >
          <div
            style={{
              background: 'rgba(255,255,255,0.98)', borderRadius: 14, boxShadow: '0 10px 28px rgba(0,0,0,0.18)',
              padding: 12, border: '1px solid #e5e7eb'
            }}
          >
            {isLoading && <div style={{ padding: 4, color: '#0ea5a4' }}>Loading…</div>}
            {error && <div style={{ padding: 4, color: '#dc2626' }}>Error: {error}</div>}
            {!isLoading && !error && info && (
              <div style={{ padding: 4, color: '#065f46', fontSize: 12 }}>{info}</div>
            )}

            {/* POINTS */}
            {meta.hasPoints && (
              <>
                {section('Points')}
                <div>
                  <div style={row}>
                    Color
                    <input type="color" style={pad} onChange={e => emitStyle('point.color', e.target.value)} />
                  </div>
                  <div style={row}>
                    Radius
                    <input
                      type="number" min="1" max="30" defaultValue={6}
                      style={{ ...pad, width: 64 }}
                      onChange={e => emitStyle('point.radius', Number(e.target.value) || 6)}
                    />
                  </div>
                  {/* ✅ Single source of truth: connect-points lives here */}
                  <div style={row}>
                    <input
                      type="checkbox"
                      onChange={e => emitStyle('connect.points', !!e.target.checked)}
                    />
                    <span style={{ marginLeft: 8 }}>Connect points with a line</span>
                  </div>
                </div>
              </>
            )}

            {/* LINES (no duplicate connect checkbox here) */}
            {showLinesSection && (
              <>
                {section('Lines')}
                {meta.hasLines && (
                  <div style={row}>
                    <input
                      type="checkbox"
                      defaultChecked
                      onChange={e => emitStyle('line.show', !!e.target.checked)}
                    />
                    <span style={{ marginLeft: 8 }}>Show line features</span>
                  </div>
                )}
                <div style={row}>
                  Color
                  <input
                    type="color"
                    style={pad}
                    onChange={e => emitStyle('line.color', e.target.value)}
                  />
                </div>
                <div style={row}>
                  Width
                  <input
                    type="number" min="1" max="16" defaultValue={2}
                    style={{ ...pad, width: 64 }}
                    onChange={e => emitStyle('line.weight', Number(e.target.value) || 2)}
                  />
                </div>
              </>
            )}

            {/* POLYGONS (shown only if present) */}
            {meta.hasPolys && (
              <>
                {section('Polygons')}
                <div>
                  <div style={row}>
                    Fill
                    <input
                      type="color"
                      style={pad}
                      onChange={e => emitStyle('poly.fillColor', e.target.value)}
                    />
                  </div>
                  <div style={row}>
                    Fill opacity
                    <input
                      type="number" step="0.05" min="0" max="1" defaultValue={0.25}
                      style={{ ...pad, width: 64 }}
                      onChange={e =>
                        emitStyle('poly.fillOpacity', Math.max(0, Math.min(1, Number(e.target.value) || 0.25)))
                      }
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
