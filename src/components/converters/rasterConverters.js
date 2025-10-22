// rasterConverters.js
// npm: npm i geotiff
// Note: import the named helpers from 'geotiff' (fromArrayBuffer/fromUrl)

import { fromArrayBuffer, fromUrl } from 'geotiff';

/**
 * Read a GeoTIFF (File or URL) and produce a lightweight preview + metadata for the UI.
 * Returns: { kind: 'raster', metadata, previewBlob, rawBlob }
 */
export async function geotiffToRaster(fileOrUrl) {
  try {
    // Accept either a URL string (COG) or a File/Blob
    const tiff = typeof fileOrUrl === 'string'
      ? await fromUrl(fileOrUrl)
      : await fromArrayBuffer(await fileOrUrl.arrayBuffer());

    if (!tiff) throw new Error('Unable to parse TIFF (geotiff returned empty).');

    // Most GeoTIFFs use the first image
    const image = await tiff.getImage();
    if (!image) throw new Error('No image found in TIFF.');

    const width = image.getWidth();
    const height = image.getHeight();

    // Geo metadata (may be undefined for plain TIFF)
    const origin = typeof image.getOrigin === 'function' ? image.getOrigin() : null;
    const resolution = typeof image.getResolution === 'function' ? image.getResolution() : null;
    const geoKeys = typeof image.getGeoKeys === 'function' ? image.getGeoKeys() : null;
    const tiepoint = typeof image.getTiePoints === 'function' ? image.getTiePoints() : null;
    const samplesPerPixel = typeof image.getSamplesPerPixel === 'function'
      ? image.getSamplesPerPixel()
      : (image.samplesPerPixel || null);

    // Decide preview size
    const maxPreviewSize = 512;
    const outW = Math.min(maxPreviewSize, width || maxPreviewSize);
    const outH = Math.min(maxPreviewSize, height || maxPreviewSize);

    // read a downsampled raster for preview
    // request interleaved output so we can map direct to RGBA canvas
    const readOptions = { interleave: true, width: outW, height: outH };
    const raster = await image.readRasters(readOptions);

    // create a PNG preview blob via canvas if DOM exists
    let previewBlob = null;
    if (typeof document !== 'undefined' && document.createElement) {
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      const imgData = ctx.createImageData(outW, outH);

      // helper to map arbitrary numeric to 0-255
      const toByte = (v) => {
        if (v === undefined || Number.isNaN(v)) return 0;
        // if already 0-255
        if (v >= 0 && v <= 255) return Math.round(v);
        // else clamp/hard scale (best-effort).
        // For proper scaling you could compute min/max per band before mapping.
        return Math.max(0, Math.min(255, Math.round(v)));
      };

      const bands = samplesPerPixel || 1;

      if (bands >= 3) {
        // raster is interleaved RGB[A] likely
        for (let i = 0, p = 0; i < raster.length; i += bands, p += 4) {
          imgData.data[p + 0] = toByte(raster[i + 0] ?? 0);
          imgData.data[p + 1] = toByte(raster[i + 1] ?? 0);
          imgData.data[p + 2] = toByte(raster[i + 2] ?? 0);
          imgData.data[p + 3] = 255;
        }
      } else if (bands === 1) {
        // single-band -> grayscale
        for (let i = 0, p = 0; i < raster.length; i++, p += 4) {
          const v = toByte(raster[i]);
          imgData.data[p + 0] = v;
          imgData.data[p + 1] = v;
          imgData.data[p + 2] = v;
          imgData.data[p + 3] = 255;
        }
      } else {
        // fallback: fill with whatever we have
        for (let i = 0, p = 0; p < imgData.data.length; i += bands, p += 4) {
          imgData.data[p + 0] = toByte(raster[i + 0] || 0);
          imgData.data[p + 1] = toByte(raster[i + 1] || raster[i + 0] || 0);
          imgData.data[p + 2] = toByte(raster[i + 2] || raster[i + 0] || 0);
          imgData.data[p + 3] = 255;
        }
      }

      ctx.putImageData(imgData, 0, 0);
      previewBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    }

    let rawBlob = null;
    if (typeof fileOrUrl !== 'string') {
      rawBlob = new Blob([await fileOrUrl.arrayBuffer()], { type: 'image/tiff' });
    }

    const metadata = {
      width,
      height,
      origin,
      resolution,
      geoKeys,
      tiepoint,
      bands: samplesPerPixel,
      driver: 'GEOTIFF'
    };

    return { kind: 'raster', metadata, previewBlob, rawBlob };
  } catch (err) {
    console.error('[rasterConverters] geotiffToRaster error', err);
    // throw so callers (PreviewRouter) can catch and fallback
    throw err;
  }
}
