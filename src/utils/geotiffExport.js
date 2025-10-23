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

/**
 * Rasterize GeoJSON onto a canvas.
 * - fc: GeoJSON FeatureCollection (assumed in EPSG:4326 lon/lat)
 * - width,height: output pixel dimensions
 * - bbox: bounding box {minX,minY,maxX,maxY} in same CRS as features
 * - style: optional { fillStyle, strokeStyle, lineWidth, pointRadius, background }
 *
 * Returns: { canvas, ctx, imageData } where imageData is Uint8ClampedArray RGBA
 */
export function rasterizeGeoJSONToCanvas(fc, width = 1024, height = 1024, bbox = null, style = {}) {
  if (!bbox) bbox = geojsonBBox(fc);
  if (!isFinite(bbox.minX) || !isFinite(bbox.minY)) throw new Error('Invalid bbox');

  const {
    fillStyle = 'rgba(255, 87, 71, 0.8)', // default fill color (semi translucent orange)
    strokeStyle = '#FF5747',
    lineWidth = 1,
    pointRadius = 4,
    background = 'rgba(255,255,255,0)' // transparent default
  } = style;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: true });

  // Draw background
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
  }

  // Affine transforms from lon/lat bbox -> pixel coords
  const minX = bbox.minX, minY = bbox.minY, maxX = bbox.maxX, maxY = bbox.maxY;
  const dx = (maxX - minX);
  const dy = (maxY - minY);
  const px = (lon) => Math.round(((lon - minX) / dx) * (width - 1));
  const py = (lat) => Math.round(((maxY - lat) / dy) * (height - 1)); // invert Y to pixels (top = maxY)

  const drawPoint = (coord) => {
    const x = px(coord[0]);
    const y = py(coord[1]);
    ctx.beginPath();
    ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  };

  const drawLineString = (coords) => {
    if (!coords || !coords.length) return;
    ctx.beginPath();
    coords.forEach((c, i) => {
      const x = px(c[0]), y = py(c[1]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  };

  const drawPolygon = (rings) => {
    // rings: [ [ [x,y], ... ], ... ]
    if (!rings || !rings.length) return;
    ctx.beginPath();
    rings.forEach((ring, ri) => {
      ring.forEach((c, i) => {
        const x = px(c[0]), y = py(c[1]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      // close ring
      ctx.closePath();
    });
    ctx.fill();
    ctx.stroke();
  };

  ctx.lineWidth = lineWidth;
  ctx.fillStyle = fillStyle;
  ctx.strokeStyle = strokeStyle;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (const f of fc.features) {
    if (!f || !f.geometry) continue;
    const g = f.geometry;
    switch (g.type) {
      case 'Point':
        drawPoint(g.coordinates);
        break;
      case 'MultiPoint':
        (g.coordinates || []).forEach(drawPoint);
        break;
      case 'LineString':
        drawLineString(g.coordinates);
        break;
      case 'MultiLineString':
        (g.coordinates || []).forEach(drawLineString);
        break;
      case 'Polygon':
        drawPolygon(g.coordinates);
        break;
      case 'MultiPolygon':
        (g.coordinates || []).forEach(drawPolygon);
        break;
      case 'GeometryCollection':
        (g.geometries || []).forEach(geom => {
          // simple recursive draw for inner geometry
          const subFeature = { type: 'Feature', properties: f.properties || {}, geometry: geom };
          rasterizeGeoJSONToCanvas({ type: 'FeatureCollection', features: [subFeature] }, width, height, bbox, style);
        });
        break;
      default:
        break;
    }
  }

  const imageData = ctx.getImageData(0, 0, width, height);
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
