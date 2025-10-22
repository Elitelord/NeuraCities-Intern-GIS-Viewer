// RasterPreview.jsx
import React, { useEffect, useRef, useState } from 'react';
import { fromArrayBuffer, fromUrl } from 'geotiff';
import proj4 from 'proj4';
import 'leaflet-imageoverlay-rotated';
// import GeoRasterLayer from "georaster-layer-for-leaflet";
// import parseGeoraster from "georaster";

// Props:
// - dataset: { kind: 'raster', metadata, previewBlob, rawBlob, url?, image? }
// - map: optional Leaflet map instance. If omitted, component will look for window.map
// - opacity: optional overlay opacity (default 0.9)
export default function RasterPreview({ dataset, map: mapProp, opacity = 0.9 }) {
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);
  const [hasOverlay, setHasOverlay] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const overlayRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    mapRef.current = mapProp || (typeof window !== 'undefined' ? window.map : null);
  }, [mapProp]);

  useEffect(() => {
    let mounted = true;
    let createdUrl = null;
    let overlay = null;

    async function getImageObject() {
      // dataset may already contain the parsed geotiff image in dataset.image
      if (!dataset) throw new Error('No dataset');

      if (dataset.image) return dataset.image;

      // try rawBlob (File) or dataset.url (remote)
      if (dataset.rawBlob) {
        const buffer = await dataset.rawBlob.arrayBuffer();
        const tiff = await fromArrayBuffer(buffer);
        const image = await tiff.getImage();
        return image;
      }

      if (dataset.url) {
        const tiff = await fromUrl(dataset.url);
        const image = await tiff.getImage();
        return image;
      }

      // no image available for georeference
      return null;
    }

    function computeCornersFromFileDirectory(image) {
      // returns corners as array of [lat, lon] in order [ul, ur, lr, ll]
      if (!image) throw new Error('No geotiff image to extract corners from');

      const width = image.getWidth();
      const height = image.getHeight();
      const fd = (typeof image.getFileDirectory === 'function') ? image.getFileDirectory() : (image.fileDirectory || {});

      // 1) ModelTransformation (4x4)
      if (fd && fd.ModelTransformation) {
        const M = fd.ModelTransformation;
        // use first 3x3 portions; M length may be 16
        const transform = (i, j) => {
          // i/pixel, j/line
          const x = M[0]*i + M[1]*j + M[3];
          const y = M[4]*i + M[5]*j + M[7];
          return [x, y];
        };
        const ul = transform(0, 0);
        const ur = transform(width, 0);
        const lr = transform(width, height);
        const ll = transform(0, height);
        return [
          [ul[1], ul[0]],
          [ur[1], ur[0]],
          [lr[1], lr[0]],
          [ll[1], ll[0]],
        ];
      }

      // 2) Tiepoints + PixelScale (common)
      const tiepoints = fd.ModelTiepoint || (typeof image.getTiePoints === 'function' ? image.getTiePoints() : null);
      const pixelScale = fd.ModelPixelScale || (fd.ModelPixelScale ? fd.ModelPixelScale : null);
      if (tiepoints && tiepoints.length >= 6 && pixelScale && pixelScale.length >= 2) {
        // tiepoints could be flat array [i,j,k,X,Y,Z,...] or array of objects; handle both
        let i0, j0, X0, Y0;
        if (Array.isArray(tiepoints) && typeof tiepoints[0] === 'number') {
          i0 = tiepoints[0];
          j0 = tiepoints[1];
          X0 = tiepoints[3];
          Y0 = tiepoints[4];
        } else if (Array.isArray(tiepoints) && tiepoints[0] && typeof tiepoints[0] === 'object') {
          // dxf-parser style? unlikely; keep safe
          const t = tiepoints[0];
          i0 = t.i ?? 0;
          j0 = t.j ?? 0;
          X0 = t.x ?? t.X ?? 0;
          Y0 = t.y ?? t.Y ?? 0;
        } else {
          i0 = 0; j0 = 0; X0 = 0; Y0 = 0;
        }

        const scaleX = pixelScale[0];
        const scaleY = pixelScale[1];

        const pixelToGeo = (i, j) => {
          const x = X0 + (i - i0) * scaleX;
          const y = Y0 - (j - j0) * scaleY; // note minus for typical origin top-left
          return [x, y];
        };

        const ul = pixelToGeo(0, 0);
        const ur = pixelToGeo(width, 0);
        const lr = pixelToGeo(width, height);
        const ll = pixelToGeo(0, height);
        return [
          [ul[1], ul[0]],
          [ur[1], ur[0]],
          [lr[1], lr[0]],
          [ll[1], ll[0]],
        ];
      }

      // 3) fallback: try getOrigin/getResolution if provided by geotiff.js
      const origin = (typeof image.getOrigin === 'function') ? image.getOrigin() : null;
      const resolution = (typeof image.getResolution === 'function') ? image.getResolution() : null;
      if (origin && resolution && origin.length >= 2 && resolution.length >= 2) {
        const originX = origin[0], originY = origin[1];
        const pixW = resolution[0], pixH = resolution[1];
        const minX = originX;
        const maxX = originX + pixW * width;
        const maxY = originY;
        const minY = originY - pixH * height;
        return [
          [maxY, minX],
          [maxY, maxX],
          [minY, maxX],
          [minY, minX],
        ];
      }

      // give up
      return null;
    }

    function extractCrsCode(geoKeysOrMetadata) {
      // geoKeys often include ProjectedCSTypeGeoKey or GeographicTypeGeoKey
      const g = geoKeysOrMetadata || {};
      if (g.ProjectedCSTypeGeoKey) return `EPSG:${g.ProjectedCSTypeGeoKey}`;
      if (g.GeographicTypeGeoKey) return `EPSG:${g.GeographicTypeGeoKey}`;
      // Some geoKeys may be nested: image.getGeoKeys() returns object; otherwise metadata.geoKeys
      return null;
    }

    function isAxisAligned(corners) {
      if (!corners || corners.length !== 4) return true;
      // corners are [ul, ur, lr, ll] in [lat, lon]
      const [ul, ur, lr, ll] = corners;
      const eps = 1e-9;
      // Check if top lat equals top lat, bottom lat equals bottom lat, left lon equals left lon, right lon equals right lon
      return Math.abs(ul[0] - ur[0]) < eps && Math.abs(ll[0] - lr[0]) < eps && Math.abs(ul[1] - ll[1]) < eps && Math.abs(ur[1] - lr[1]) < eps;
    }
    // --- helper: dynamic script loader + ensure UMD libs loaded ---
function loadScript(url, opts = {}) {
  return new Promise((resolve, reject) => {
    // already loaded?
    const existing = Array.from(document.scripts).find(s => s.src && s.src.indexOf(url) !== -1);
    if (existing && (existing.getAttribute('data-loaded') === 'true' || existing.readyState === 'complete')) {
      resolve(existing);
      return;
    }
    const s = document.createElement('script');
    s.src = url;
    s.async = !!opts.async;
    if (opts.crossOrigin) s.crossOrigin = opts.crossOrigin;
    s.onload = () => {
      s.setAttribute('data-loaded', 'true');
      resolve(s);
    };
    s.onerror = (e) => {
      reject(new Error('Failed to load ' + url));
    };
    document.head.appendChild(s);
  });
}

let _georasterUmdLoaded = false;
async function ensureGeorasterUmd() {
  if (_georasterUmdLoaded) return true;

  // CDN URLs (these are known UMD builds on unpkg; replace if you prefer specific versions)
  const urls = [
    'https://unpkg.com/geotiff@2.1.4-beta.0/dist-browser/geotiff.js',                      // geotiff.js
    'https://unpkg.com/georaster@1.6.0/dist/georaster.browser.bundle.min.js',                  // georaster UMD (parseGeoraster)
    'https://unpkg.com/plotty/dist/plotty.min.js',                                // plotty renderer (optional but often needed)
    'https://unpkg.com/georaster-layer-for-leaflet@4.1.2/dist/v3/webpack/bundle/georaster-layer-for-leaflet.min.js' // georaster-layer UMD
  ];

  for (const u of urls) {
    try {
      // Skip loading if a script with same base filename already present and loaded
      const already = Array.from(document.scripts).find(s => s.src && s.src.indexOf(u.split('/').pop()) !== -1 && s.getAttribute('data-loaded') === 'true');
      if (already) { continue; }

      // load and wait
      await loadScript(u);
      console.debug('[RasterPreview] loaded script:', u);
    } catch (err) {
      console.warn('[RasterPreview] failed to load script:', u, err);
      // continue attempting the rest (we'll detect presence later)
    }
  }

  // give the window a tick to register globals
  await new Promise(r => setTimeout(r, 50));

  // Log what we found
  console.debug('[RasterPreview] window.parseGeoraster?', typeof window.parseGeoraster);
  console.debug('[RasterPreview] window.georaster?', !!window.georaster, Object.keys(window).slice(0,200));
  console.debug('[RasterPreview] window.GeoRasterLayer?', typeof window.GeoRasterLayer);
  console.debug('[RasterPreview] window.L.GeoRasterLayer?', window.L ? typeof window.L.GeoRasterLayer : 'no L');

  // mark loaded flag if at least parseGeoraster or GeoRasterLayer is present
  _georasterUmdLoaded = !!(typeof window.parseGeoraster === 'function' || typeof window.GeoRasterLayer === 'function' || (window.L && typeof window.L.GeoRasterLayer === 'function'));

  return _georasterUmdLoaded;
}

    // --- inside RasterPreview.jsx (replace attachOverlay with this) ---
    async function attachOverlay() {
      setError(null);
      setWarning(null);

      const map = mapRef.current || (typeof window !== "undefined" ? window.map : null);
      if (!map) {
        setWarning("No map instance found (window.map or map prop). Showing static preview.");
        return;
      }

      // create object URL for preview PNG if available
      if (dataset.previewBlob) {
        const url = URL.createObjectURL(dataset.previewBlob);
        if (mounted) setPreviewUrl(url);
        // keep createdUrl variable in outer scope so cleanup can revoke it (your existing code does this)
        createdUrl = url;
      }

      // prefer full raw blob (full GeoTIFF) for georaster parsing if present
      let arrayBuffer = null;
      try {
        if (dataset.rawBlob) {
          arrayBuffer = await dataset.rawBlob.arrayBuffer();
        } else if (dataset.url) {
          const resp = await fetch(dataset.url);
          arrayBuffer = await resp.arrayBuffer();
        } else {
          // if neither rawBlob nor url, we can still try with preview but parsing may not work
        }
      } catch (err) {
        console.error("[RasterPreview] Failed to fetch/arrayBuffer raw blob", err);
        setWarning("Unable to read raw GeoTIFF data — showing static preview.");
        return;
      }

      // --- locate the UMD parse function (georaster) ---
      const findParseGeoraster = () => {
        // Common UMD exposures to try
        const tries = [
          () => window.parseGeoraster,
          () => window.georaster && window.georaster.parseGeoraster,
          () => window.ParseGeoraster, // unlikely but safe
          () => window.parseGeorasterBrowser,
          () => window.parseGeorasterModule,
        ];
        for (const t of tries) {
          try {
            const fn = t();
            if (typeof fn === "function") return fn;
          } catch (e) { /* ignore */ }
        }
        return null;
      };

      const parseGeorasterFn = findParseGeoraster();
      if (!parseGeorasterFn) {
        console.warn("[RasterPreview] parseGeoraster UMD not found on window. window keys:", Object.keys(window).slice(0,200));
      } else {
        console.debug("[RasterPreview] found parseGeoraster:", parseGeorasterFn);
      }

      // --- locate the GeoRasterLayer constructor ---
      const findGeoRasterLayerCtor = () => {
        const tries = [
          () => window.GeoRasterLayer, // common
          () => window.GeoRasterLayerForLeaflet,
          () => window.georasterLayer && window.georasterLayer.GeoRasterLayer,
          () => window.GeorasterLayer,
          () => (window.GeoRasterLayer ? window.GeoRasterLayer : null),
          () => (window["georaster-layer-for-leaflet"] ? window["georaster-layer-for-leaflet"].GeoRasterLayer : null),
          () => (window.L && window.L.GeoRasterLayer ? window.L.GeoRasterLayer : null),
          () => (window.L && window.L.GeorasterLayer ? window.L.GeorasterLayer : null),
        ];
        for (const t of tries) {
          try {
            const C = t();
            if (typeof C === "function" || (typeof C === "object" && C !== null)) {
              // some UMDs put a factory object, but constructor should be function
              return C;
            }
          } catch (e) { /* ignore */ }
        }
        return null;
      };
      try {
      const ok = await ensureGeorasterUmd();
        if (!ok) {
          console.info('[RasterPreview] georaster UMD scripts not available after attempted load; will use fallback (imageOverlay) if possible.');
        } else {
          console.info('[RasterPreview] georaster UMD detected; will attempt to use it.');
        }
      } catch (err) {
        console.warn('[RasterPreview] ensureGeorasterUmd threw', err);
      }
      const GeoRasterLayerCtor = findGeoRasterLayerCtor();
      if (!GeoRasterLayerCtor) {
        console.warn("[RasterPreview] GeoRasterLayer UMD not found on window. window.L keys:", window.L ? Object.keys(window.L).slice(0,200) : "no L");
      } else {
        console.debug("[RasterPreview] found GeoRasterLayer ctor:", GeoRasterLayerCtor);
      }

      // If we have parse + ctor, try using georaster Layer
      if (parseGeorasterFn && GeoRasterLayerCtor && arrayBuffer) {
        try {
          // parseGeoraster sometimes expects an ArrayBuffer or an object with url; support Buffer or Uint8Array
          const georaster = await parseGeorasterFn(arrayBuffer);
          // GeoRasterLayer may be default export or named; try to instantiate robustly
          let layer = null;
          try {
            // some UMD expose constructor directly as function/class
            layer = new (GeoRasterLayerCtor)( {
              georaster,
              opacity,
              resolution: 256,
              pixelValuesToColorFn: (values) => {
                const v = values && values.length ? values[0] : 0;
                const c = Math.max(0, Math.min(255, Math.round(v || 0)));
                return `rgb(${c},${c},${c})`;
              },
            } );
          } catch (e) {
            // sometimes the UMD attaches factory under L.GeoRasterLayer or requires L.GeoRasterLayer constructor usage
            if (window.L && typeof window.L.GeoRasterLayer === "function") {
              layer = new window.L.GeoRasterLayer({
                georaster,
                opacity,
                resolution: 256,
                pixelValuesToColorFn: (values) => {
                  const v = values && values.length ? values[0] : 0;
                  const c = Math.max(0, Math.min(255, Math.round(v || 0)));
                  return `rgb(${c},${c},${c})`;
                },
              });
            } else {
              throw e;
            }
          }

          if (!layer) {
            throw new Error("GeoRasterLayer constructor yielded no layer instance");
          }

          overlayRef.current = layer;
       
          // NEW: mark overlay present and DO NOT set any preview image state
          setHasOverlay(true);
          // do NOT call setPreviewUrl(...) here

          layer.addTo(map);
          try { map.fitBounds(layer.getBounds(), { maxZoom: 16 }); } catch (e) { console.warn("[RasterPreview] fitBounds failed", e); }

          return; // success path finished
        } catch (err) {
          console.error("[RasterPreview] georaster/UMD attach error", err);
          // fall through to fallback behavior
        }
      } else {
        console.info("[RasterPreview] georaster UMD not fully available (parse:", !!parseGeorasterFn, "ctor:", !!GeoRasterLayerCtor, "arrayBuffer:", !!arrayBuffer, ")");
      }

      // FALLBACK: if we couldn't use georaster Layer, try the axis-aligned L.imageOverlay route using your existing corner calc
      try {
        // compute corners using your existing helper (computeCornersFromFileDirectory)
        const image = arrayBuffer ? await (async () => {
          try {
            const t = await fromArrayBuffer(arrayBuffer);
            return await t.getImage();
          } catch (e) { return null; }
        })() : null;

        let corners = null;
        if (image) {
          try { corners = computeCornersFromFileDirectory(image); } catch (e) { corners = null; }
        }

        if (!corners && dataset.metadata && dataset.metadata?.bbox) {
          // metadata bbox path (your existing code)
          const bb = dataset.metadata.bbox;
          if (bb && bb.length === 4) {
            const [minX, minY, maxX, maxY] = bb;
            corners = [
              [maxY, minX],
              [maxY, maxX],
              [minY, maxX],
              [minY, minX],
            ];
          }
        }

        if (!corners) {
          setWarning("No georeference available — showing static preview.");
          return;
        }

        const axisAligned = isAxisAligned(corners);
        if (!axisAligned) {
          // rotated fallback — try rotated plugin; if not available, warn
          if (typeof window.L?.imageOverlay?.rotated === "function" || window.L?.ImageOverlay?.Rotated) {
            // try rotated path (existing code)
            // note: you already have rotated logic above; re-use it here
          } else {
            setWarning("Image is georeferenced with rotation but rotated-image plugin not available. Showing static preview.");
            return;
          }
        } else {
          // axis aligned -> create imageOverlay from preview or raw blob
          const [ul, ur, lr, ll] = corners;
          const north = ul[0], south = lr[0];
          const west = ul[1], east = ur[1];
          const bounds = [[south, west], [north, east]];
          const src = createdUrl || (dataset.previewBlob ? URL.createObjectURL(dataset.previewBlob) : dataset.url);
          const overlay = window.L.imageOverlay ? window.L.imageOverlay(src, bounds, { opacity }).addTo(map) : null;
          if (overlay) {
            overlayRef.current = overlay;
            setHasOverlay(true);
            try { map.fitBounds(bounds, { maxZoom: 16 }); } catch (e) {}
          } else {
            setWarning("Failed to attach image overlay — showing static preview.");
          }
        }
      } catch (err) {
        console.error("[RasterPreview] fallback overlay error", err);
        setWarning("Failed to attach overlay — showing static preview.");
      }
    }



    attachOverlay().catch((err) => {
      console.error('[RasterPreview] attachOverlay top-level error', err);
      if (mounted) setError(String(err));
    });

    return () => {
      mounted = false;
      // cleanup overlay and object URLs
      try {
        if (overlayRef.current) {
          try { overlayRef.current.remove(); } catch (e) {}
          overlayRef.current = null;
        }
        if (createdUrl) {
          URL.revokeObjectURL(createdUrl);
          createdUrl = null;
        }
      } catch (e) {
          setHasOverlay(false);
      }
    };
  }, [dataset, mapProp, opacity]);

  return (
    <div style={{ padding: 12 }}>
     
     

      
    </div>
  );
}
