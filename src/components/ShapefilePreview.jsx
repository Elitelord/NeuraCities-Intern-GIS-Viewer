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
        // Many shapefile UIs upload either a zipped shapefile or separate .shp/.dbf/.shx files.
        // Use shpjs convenience function which accepts an ArrayBuffer of a zip or file list.
        const file = files?.[0];
        if (!file) throw new Error('No file provided');

        // If the user uploaded a .zip containing the shapefile
        if (file.name.toLowerCase().endsWith('.zip')) {
          const buffer = await file.arrayBuffer();
          const geojson = await shp.parseZip(new Uint8Array(buffer));
          if (!geojson || !Array.isArray(geojson.features) || geojson.features.length === 0) {
            throw new Error('No features found in zipped shapefile');
          }
          const fc = { type: 'FeatureCollection', features: geojson.features };
          try { window.__DEBUG_LAST_GEOJSON__ = fc; } catch (e) {}
          setInfo(`Converted ${fc.features.length} features (zip).`);
          if (typeof onConvert === 'function') onConvert(fc);
          setIsLoading(false);
          hasLoadedRef.current = true;
          return;
        }

        // If the UI passed multiple files (shp + dbf), try to combine them:
        const shpFile = files?.find(f => f.name.toLowerCase().endsWith('.shp'));
        const dbfFile = files?.find(f => f.name.toLowerCase().endsWith('.dbf'));
        const zipLikeFiles = files && files.length > 1 ? files : null;

        if (shpFile && dbfFile) {
          // shpjs has a `parseShp(parseDbf)` API but simpler is to build a zip-like object
          // Build a zip-like object expected by shp.parseShp / shp.parseDbf
          const shpBuffer = await shpFile.arrayBuffer();
          const dbfBuffer = await dbfFile.arrayBuffer();

          // use shp.parseShp / parseDbf if available
          let geometries = [];
          let records = [];
          try {
            geometries = await shp.parseShp(shpBuffer);
            records = await shp.parseDbf(dbfBuffer);
          } catch (e) {
            // Fallback: try the high-level parseZip-like helper by packaging into a blob zip is heavier,
            // but many environments prefer uploading zip. If parseShp/parseDbf fail, throw.
            throw e;
          }

          const features = (geometries || []).map((geom, i) => ({
            type: 'Feature',
            geometry: geom,
            properties: records?.[i] || {}
          }));

          if (!features.length) throw new Error('No valid features found in shapefile.');

          const fc = { type: 'FeatureCollection', features };
          try { window.__DEBUG_LAST_GEOJSON__ = fc; } catch (e) {}
          setInfo(`Converted ${features.length} features (shp+dbf).`);
          if (typeof onConvert === 'function') onConvert(fc);
          setIsLoading(false);
          hasLoadedRef.current = true;
          return;
        }

        // As last resort, if multiple files are present (e.g., a zip was extracted by the uploader),
        // try to pass them to shpjs high-level parser which accepts a File or ArrayBuffer or URL.
        if (zipLikeFiles) {
          // Create a combined zip (only if environment didn't already send a .zip)
          // but shpjs.parseZip expects ArrayBuffer of a zip; if that's not available, we bail.
          // Simpler: if user passed a single non-zip shapefile file we can't parse reliably here.
          throw new Error('Please upload a zipped shapefile (.zip) or both .shp and .dbf files.');
        }

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
          <button onClick={() => typeof onConvert === 'function' && onConvert(window.__DEBUG_LAST_GEOJSON__)} style={{ padding:'8px 12px', background:'#0ea5a4', color:'white', borderRadius:6 }}>
            Open in GeoJSON Preview
          </button>
        )}
        {onClose && <button onClick={onClose} style={{ marginLeft:8, padding:'8px 12px', borderRadius:6 }}>Close</button>}
      </div>
    </div>
  );
};

export default ShapefilePreview;
