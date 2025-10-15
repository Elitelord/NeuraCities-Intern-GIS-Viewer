import React, { useEffect, useRef, useState } from 'react';
import shp from 'shpjs';

const ShapefilePreview = ({ files, onClose, onConvert }) => {
  const hasLoadedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState('');

  useEffect(() => {
    if (hasLoadedRef.current) return;

    const loadShapefile = async () => {
      setIsLoading(true);
      setError(null);
      setInfo('Parsing shapefile...');

      try {
        const file = files?.[0];
        if (!file) throw new Error('No file provided');

        // ✅ ZIP path: use ArrayBuffer directly (NOT Uint8Array)
        if (file.name.toLowerCase().endsWith('.zip')) {
          const buffer = await file.arrayBuffer();

          // You can use either helper; both take ArrayBuffer:
          // const geojson = await shp.parseZip(buffer);
          const geojson = await shp(buffer);

          // shpjs may return a FeatureCollection, or an object of layers.
          let fc;
          if (geojson?.type === 'FeatureCollection') {
            fc = geojson;
          } else if (geojson && typeof geojson === 'object' && !Array.isArray(geojson)) {
            // multi-layer: merge into one FC
            const all = [];
            for (const k of Object.keys(geojson)) {
              const layer = geojson[k];
              if (layer?.type === 'FeatureCollection' && Array.isArray(layer.features)) {
                all.push(...layer.features);
              }
            }
            fc = { type: 'FeatureCollection', features: all };
          } else {
            throw new Error('Unrecognized shapefile structure in zip.');
          }

          const features = (fc.features || []).filter(f => f && f.geometry && f.geometry.coordinates);
          if (features.length === 0) throw new Error('No features found in zipped shapefile');

          const out = { type: 'FeatureCollection', features };
          try { window.__DEBUG_LAST_GEOJSON__ = out; } catch {}
          setInfo(`Converted ${features.length} features (zip).`);
          if (typeof onConvert === 'function') onConvert(out);
          setIsLoading(false);
          hasLoadedRef.current = true;
          return;
        }

        // Loose files path: .shp + .dbf (optional .shx/.prj)
        const shpFile = files?.find(f => f.name.toLowerCase().endsWith('.shp'));
        const dbfFile = files?.find(f => f.name.toLowerCase().endsWith('.dbf'));

        if (shpFile && dbfFile) {
          const shpBuffer = await shpFile.arrayBuffer();
          const dbfBuffer = await dbfFile.arrayBuffer();

          let geometries = [];
          let records = [];
          try {
            geometries = await shp.parseShp(shpBuffer);
            records = await shp.parseDbf(dbfBuffer);
          } catch (e) {
            throw new Error('Failed reading .shp/.dbf buffers');
          }

          const features = (geometries || []).map((geom, i) => ({
            type: 'Feature',
            geometry: geom,
            properties: records?.[i] || {}
          }));

          if (!features.length) throw new Error('No valid features found in shapefile.');

          const fc = { type: 'FeatureCollection', features };
          try { window.__DEBUG_LAST_GEOJSON__ = fc; } catch {}
          setInfo(`Converted ${features.length} features (shp+dbf).`);
          if (typeof onConvert === 'function') onConvert(fc);
          setIsLoading(false);
          hasLoadedRef.current = true;
          return;
        }

        // Fallback message if user dragged odd combos
        throw new Error('Unsupported upload form for shapefile. Provide a .zip or both .shp + .dbf.');
      } catch (err) {
        console.error('[Shapefile] Error:', err);
        setError(err.message || 'Failed to parse shapefile');
        setIsLoading(false);
      }
    };

    loadShapefile();

    return () => {
      hasLoadedRef.current = false;
    };
  }, [files, onConvert]);

  if (isLoading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200 }}>
        <div style={{ textAlign:'center' }}>
          <div style={{
            height: 32, width: 32, border: '4px solid #008080', borderTopColor:'transparent',
            borderRadius: '999px', margin: '0 auto 12px', animation: 'spin 0.8s linear infinite'
          }} />
          <p style={{ color: '#475569' }}>Converting shapefile to GeoJSON...</p>
          {info && <p style={{ fontSize:12, color:'#64748b' }}>{info}</p>}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ color:'#b91c1c', textAlign:'center', padding:16 }}>
        <p style={{ fontWeight:700, fontSize:18, marginBottom:8 }}>Error converting shapefile</p>
        <p>{error}</p>
        {onClose && <button onClick={onClose} style={{ marginTop:12, padding:'8px 12px', borderRadius:6 }}>Close</button>}
      </div>
    );
  }

  return (
    <div style={{ padding: 12 }}>
      <div style={{ color:'#065f46', fontWeight:600 }}>{info || 'Conversion complete'}</div>
      <div style={{ marginTop:8 }}>
        {typeof onConvert === 'function' && (
          <button onClick={() => onConvert(window.__DEBUG_LAST_GEOJSON__)} style={{ padding:'8px 12px', background:'#0ea5a4', color:'white', borderRadius:6 }}>
            Open in GeoJSON Preview
          </button>
        )}
        {onClose && <button onClick={onClose} style={{ marginLeft:8, padding:'8px 12px', borderRadius:6 }}>Close</button>}
      </div>
    </div>
  );
};

export default ShapefilePreview;
