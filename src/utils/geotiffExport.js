// src/utils/geoTiffExport.js  (replacement function using geotiff.js)
import GeoTIFF, { writeArrayBuffer } from 'geotiff'; // writeArrayBuffer is exported in geotiff.js docs
// Convert FeatureCollection -> bbox {minX, minY, maxX, maxY}
export function geojsonBBox(fc) {
  if (!fc || !Array.isArray(fc.features) || fc.features.length === 0) {
    throw new Error('Empty GeoJSON');
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walkCoords = (coords) => {
    if (!coords) return;
    if (typeof coords[0] === 'number') {
      const [x, y] = coords;
      if (Number.isFinite(x) && Number.isFinite(y)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    } else {
      coords.forEach(walkCoords);
    }
  };
  for (const f of fc.features) {
    if (f && f.geometry && f.geometry.coordinates) {
      walkCoords(f.geometry.coordinates);
    }
  }
  return { minX, minY, maxX, maxY };
}

// robust rasterize with concurrency + timeout + progress reporting
// replace previous rasterizeGeoJSONWithBasemapToCanvas with this version

// helpers for tile math (Web Mercator)
function lonToX(lon) {
  return (lon + 180) / 360;
}
function latToY(lat) {
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
  return y;
}
function lonLatToTileXY(lon, lat, z) {
  const n = Math.pow(2, z);
  const x = Math.floor(lonToX(lon) * n);
  const y = Math.floor(latToY(lat) * n);
  return { x, y };
}
function bboxToTileRange(bbox, z) {
  const tl = lonLatToTileXY(bbox.minX, bbox.maxY, z);
  const br = lonLatToTileXY(bbox.maxX, bbox.minY, z);
  const n = Math.pow(2, z);
  const x0 = Math.max(0, Math.min(tl.x, n - 1));
  const x1 = Math.max(0, Math.min(br.x, n - 1));
  const y0 = Math.max(0, Math.min(tl.y, n - 1));
  const y1 = Math.max(0, Math.min(br.y, n - 1));
  return { xMin: Math.min(x0, x1), xMax: Math.max(x0, x1), yMin: Math.min(y0, y1), yMax: Math.max(y0, y1) };
}

/**
 * Robust tile fetch with timeout + crossOrigin image loading
 * Returns Promise<Image> or rejects on timeout/error.
 */
function fetchTileImageWithTimeout(url, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let timedOut = false;
    let timer = setTimeout(() => {
      timedOut = true;
      img.src = ''; // stop load
      reject(new Error(`Tile timeout after ${timeoutMs}ms: ${url}`));
    }, timeoutMs);

    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (timedOut) return;
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = (e) => {
      if (timedOut) return;
      clearTimeout(timer);
      reject(new Error(`Tile load error: ${url}`));
    };
    img.src = url;
  });
}

/**
 * concurrency-limited queue runner
 * tasks: array of functions that return promises
 * maxConcurrency: number
 * onProgress(optional): (completed, total) => void
 */
async function runConcurrent(tasks, maxConcurrency = 6, onProgress) {
  const total = tasks.length;
  let idx = 0;
  let active = 0;
  let completed = 0;
  const results = new Array(total);

  return new Promise((resolve) => {
    function next() {
      if (idx >= total && active === 0) {
        return resolve(results);
      }
      while (active < maxConcurrency && idx < total) {
        const i = idx++;
        active++;
        tasks[i]().then((res) => {
          results[i] = { status: 'fulfilled', value: res };
        }).catch((err) => {
          results[i] = { status: 'rejected', reason: err };
        }).finally(() => {
          active--;
          completed++;
          if (typeof onProgress === 'function') onProgress(completed, total);
          next();
        });
      }
    }
    next();
  });
}

/**
 * Rasterize GeoJSON + basemap to canvas robustly.
 *
 * fc: GeoJSON FeatureCollection (lon/lat)
 * width,height: output pixels
 * bbox: {minX,minY,maxX,maxY}
 * options:
 *  - basemapTemplate: URL template
 *  - subdomains: 'abcd' or ['a','b']
 *  - zoom: tile zoom
 *  - tileSize: 256
 *  - tileRetinaSuffix: '' or '@2x'
 *  - maxConcurrency: number (default 6)
 *  - tileTimeoutMs: number (default 7000)
 *  - onTileProgress: function(completed, total)
 *  - style: fillStyle, strokeStyle, etc.
 *
 * Returns { canvas, ctx, imageData }
 */
export async function rasterizeGeoJSONWithBasemapToCanvas(fc, width = 1024, height = 1024, bbox = null, options = {}) {
  if (!bbox) {
    // simple bbox calc if you don't already have a helper available
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const f of fc.features || []) {
      (function walk(coords) {
        if (!coords) return;
        if (typeof coords[0] === 'number') {
          const [x, y] = coords;
          minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        } else coords.forEach(walk);
      })(f.geometry && f.geometry.coordinates);
    }
    bbox = { minX, minY, maxX, maxY };
  }

  const {
    basemapTemplate = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    subdomains = 'abcd',
    zoom = 12,
    tileSize = 256,
    tileRetinaSuffix = '',
    maxConcurrency = 6,
    tileTimeoutMs = 7000,
    onTileProgress = null,
    fillStyle = 'rgba(255,87,71,0.8)',
    strokeStyle = '#FF5747',
    lineWidth = 1,
    pointRadius = 4,
    background = 'rgba(255,255,255,0)'
  } = options;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: true });

  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  } else ctx.clearRect(0, 0, width, height);

  // tile math range
  const tileRange = bboxToTileRange(bbox, zoom);
  const n = Math.pow(2, zoom);

  // global pixel coords for bbox
  const minPx = lonToX(bbox.minX) * n * tileSize;
  const maxPx = lonToX(bbox.maxX) * n * tileSize;
  const minPy = latToY(bbox.maxY) * n * tileSize; // top
  const maxPy = latToY(bbox.minY) * n * tileSize; // bottom
  const bboxPxWidth = Math.max(1, maxPx - minPx);
  const bboxPxHeight = Math.max(1, maxPy - minPy);

  const globalPxToCanvasX = (globalPx) => ((globalPx - minPx) / bboxPxWidth) * (width - 1);
  const globalPyToCanvasY = (globalPy) => ((globalPy - minPy) / bboxPxHeight) * (height - 1);

  const subArr = Array.isArray(subdomains) ? subdomains : String(subdomains).split('');

  // build a list of tile tasks
  const tileTasks = [];
  const tileInfos = []; // for debugging mapping
  for (let tx = tileRange.xMin; tx <= tileRange.xMax; ++tx) {
    for (let ty = tileRange.yMin; ty <= tileRange.yMax; ++ty) {
      const s = subArr[(tx + ty) % subArr.length] || subArr[0];
      const url = basemapTemplate.replace('{z}', String(zoom)).replace('{x}', String(tx)).replace('{y}', String(ty)).replace('{s}', s).replace('{r}', tileRetinaSuffix || '');
      const pxLeft = tx * tileSize;
      const pyTop = ty * tileSize;
      const canvasX = Math.round(globalPxToCanvasX(pxLeft));
      const canvasY = Math.round(globalPyToCanvasY(pyTop));
      const scaleX = (tileSize / bboxPxWidth) * (width - 1);
      const scaleY = (tileSize / bboxPxHeight) * (height - 1);

      // each task will attempt to load and then draw
      tileTasks.push(async () => {
        try {
          const img = await fetchTileImageWithTimeout(url, tileTimeoutMs);
          // drawImage may still throw if canvas is tainted; catch and pass through
          try {
            ctx.drawImage(img, canvasX, canvasY, Math.max(1, Math.ceil(scaleX)), Math.max(1, Math.ceil(scaleY)));
            return { ok: true, tx, ty, url };
          } catch (drawErr) {
            return { ok: false, tx, ty, url, reason: (drawErr && drawErr.message) || 'draw error' };
          }
        } catch (err) {
          return { ok: false, tx, ty, url, reason: err.message || 'load failed' };
        }
      });

      tileInfos.push({ tx, ty, url, canvasX, canvasY, scaleX, scaleY });
    }
  }

  // run with concurrency, report progress if requested
  const results = await runConcurrent(tileTasks, maxConcurrency, onTileProgress);

  // inspect results to see failures (log them)
  const failedTiles = results.filter(r => r && r.status === 'fulfilled' && r.value && !r.value.ok)
                             .map(r => ({ tx: r.value.tx, ty: r.value.ty, url: r.value.url, reason: r.value.reason }));
  const rejected = results.filter(r => r && r.status === 'rejected').map((r, i) => ({ index: i, reason: r.reason && r.reason.message }));

  if (failedTiles.length) {
    console.warn('[rasterize] some tiles failed to draw (possible CORS/404):', failedTiles.slice(0, 10));
  }
  if (rejected.length) {
    console.warn('[rasterize] some tile promises rejected:', rejected.slice(0,10));
  }

  // draw vector overlay on top (same as before)
  ctx.lineWidth = lineWidth;
  ctx.fillStyle = fillStyle;
  ctx.strokeStyle = strokeStyle;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const lonlatToCanvas = (lon, lat) => {
    const gx = lonToX(lon) * n * tileSize;
    const gy = latToY(lat) * n * tileSize;
    const cx = globalPxToCanvasX(gx);
    const cy = globalPyToCanvasY(gy);
    return [cx, cy];
  };

  const drawPoint = (coord) => {
    const [x, y] = lonlatToCanvas(coord[0], coord[1]);
    ctx.beginPath();
    ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  };
  const drawLineString = (coords) => {
    if (!coords || !coords.length) return;
    ctx.beginPath();
    coords.forEach((c, i) => {
      const [x, y] = lonlatToCanvas(c[0], c[1]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  };
  const drawPolygon = (rings) => {
    if (!rings || !rings.length) return;
    ctx.beginPath();
    rings.forEach((ring) => {
      ring.forEach((c, i) => {
        const [x, y] = lonlatToCanvas(c[0], c[1]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
    });
    ctx.fill();
    ctx.stroke();
  };

  for (const f of fc.features || []) {
    if (!f || !f.geometry) continue;
    const g = f.geometry;
    switch (g.type) {
      case 'Point': drawPoint(g.coordinates); break;
      case 'MultiPoint': (g.coordinates||[]).forEach(drawPoint); break;
      case 'LineString': drawLineString(g.coordinates); break;
      case 'MultiLineString': (g.coordinates||[]).forEach(drawLineString); break;
      case 'Polygon': drawPolygon(g.coordinates); break;
      case 'MultiPolygon': (g.coordinates||[]).forEach(drawPolygon); break;
      default: break;
    }
  }

  // final imageData retrieval (will throw if canvas tainted)
  let imageData;
  try {
    imageData = ctx.getImageData(0, 0, width, height);
  } catch (err) {
    // If tainted, give a helpful error for debugging
    throw new Error('Canvas is tainted when reading pixels. This usually means tiles lack CORS headers. See console for tile failure list.');
  }

  return { canvas, ctx, imageData };
}



/**
 * Write GeoTIFF using geotiff.js writeArrayBuffer with interleaved RGB(A) data.
 *
 * imageDataBytes: Uint8ClampedArray (RGBA from canvas.getImageData().data)
 * width, height: integers
 * bbox: { minX, minY, maxX, maxY } in same CRS as features
 * options: { samples:3|4, bitsPerSample:8|16, compression:'NONE'|'LZW'|'DEFLATE', description }
 *
 * Returns: ArrayBuffer (GeoTIFF)
 */
export async function writeGeoTIFFWithGeoTiffJS(imageDataBytes, width, height, bbox, options = {}) {
  const { samples = 3, bitsPerSample = 8, compression = 'NONE', description = 'NeuraCities export' } = options;

  // --- validations ---
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`writeGeoTIFFWithGeoTiffJS: width and height must be numbers. Got width=${width} height=${height}`);
  }
  const expectedLen = width * height * 4;
  if (!imageDataBytes || imageDataBytes.length < expectedLen) {
    throw new Error(`writeGeoTIFFWithGeoTiffJS: imageData length mismatch. Expected >= ${expectedLen}, got ${imageDataBytes ? imageDataBytes.length : 0}`);
  }
  if (!bbox || !Number.isFinite(bbox.minX) || !Number.isFinite(bbox.maxX) || !Number.isFinite(bbox.minY) || !Number.isFinite(bbox.maxY)) {
    throw new Error('writeGeoTIFFWithGeoTiffJS: bbox must have numeric minX,minY,maxX,maxY');
  }

  // --- interleave RGB (or RGBA) into a single flat array ---
  const total = width * height;
  const hasAlpha = samples === 4;
  const outLen = total * (hasAlpha ? 4 : 3);
  const interleaved = new (bitsPerSample === 16 ? Uint16Array : Uint8Array)(outLen);

  if (bitsPerSample === 16) {
    // upscale byte -> 16-bit by *257
    for (let px = 0, src = 0, dest = 0; px < total; ++px, src += 4) {
      interleaved[dest++] = imageDataBytes[src] * 257;
      interleaved[dest++] = imageDataBytes[src + 1] * 257;
      interleaved[dest++] = imageDataBytes[src + 2] * 257;
      if (hasAlpha) interleaved[dest++] = imageDataBytes[src + 3] * 257;
    }
  } else {
    for (let px = 0, src = 0, dest = 0; px < total; ++px, src += 4) {
      interleaved[dest++] = imageDataBytes[src];
      interleaved[dest++] = imageDataBytes[src + 1];
      interleaved[dest++] = imageDataBytes[src + 2];
      if (hasAlpha) interleaved[dest++] = imageDataBytes[src + 3];
    }
  }

  // --- Geo transform tags ---
  const scaleX = (bbox.maxX - bbox.minX) / width;
  const scaleY = (bbox.maxY - bbox.minY) / height;
  const modelPixelScale = [scaleX, scaleY, 0];
  const modelTiepoint = [0, 0, 0, bbox.minX, bbox.maxY, 0];

  // compression numeric code (1 none, 5 LZW, 32946 deflate if supported)
  const compressionCode = compression === 'LZW' ? 5 : (compression === 'DEFLATE' ? 32946 : 1);

  // BitsPerSample must be an array length == samples
  const bitsArray = Array.isArray(bitsPerSample) ? bitsPerSample : Array(samples).fill(bitsPerSample);

  // --- metadata object expected by writeArrayBuffer ---
  // note: writer examples use lowercase width/height keys; include essential TIFF names the writer recognizes.
  const metadata = {
    // REQUIRED lowercase keys so writer can find dimensions internally
    width,
    height,

    // TIFF/GeoTIFF tag names (exact casing)
    SamplesPerPixel: samples,
    BitsPerSample: bitsArray,               // e.g. [8,8,8] or [16,16,16]
    Compression: compressionCode,
    PhotometricInterpretation: 2,           // 2 == RGB
    PlanarConfiguration: 1,                 // 1 == chunky/interleaved
    ModelPixelScale: modelPixelScale,       // GeoTIFF tag (33550)
    ModelTiepoint: modelTiepoint,           // GeoTIFF tag (33922)
    ImageDescription: description
    // Optionally: GeographicTypeGeoKey: 4326  (or GeoKeyDirectory & GeoAsciiParams...) if you want EPSG embedded
  };

  console.debug('[writeGeoTIFFWithGeoTiffJS] calling writeArrayBuffer with metadata keys:', Object.keys(metadata));

  // --- Core write: pass the single interleaved array as values AND the metadata object ---
  // geotiff.js writeArrayBuffer expects (values, metadata) where values is a flat typed array for interleaved data.
  // It will create a single-image GeoTIFF from that buffer.
  const arrayBuffer = await writeArrayBuffer(interleaved, metadata);

  if (!arrayBuffer) throw new Error('writeArrayBuffer returned null/undefined');

  // If writeArrayBuffer returns Uint8Array adapt to ArrayBuffer
  if (arrayBuffer instanceof Uint8Array) return arrayBuffer.buffer;
  return arrayBuffer;
}
