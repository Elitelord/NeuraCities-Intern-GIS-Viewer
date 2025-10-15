const MB = 1024 * 1024;

export const MAX_FILE_SIZE_MB = 200;     // per-file limit
export const MAX_FILES_PER_UPLOAD = 50;

// include .zip so zipped shapefiles are accepted
const ALLOWED_EXTS = new Set([
  'shp','dbf','shx','prj','json','geojson','csv','xlsx','xls','zip',
  // roadmap (won't preview yet, but we accept uploads)
  'kml','kmz','gpx','tif','tiff','dwg','dxf','gpkg','gdb','mxd','aprx',
  'lyr','lyrx','pdf','pdfx','dgnlib','las','laz','hdf','img','osm','cityjson'
]);

/**
 * Validate raw uploaded files.
 * Returns array of error strings; empty if all pass.
 */
export function validateRawFiles(fileList) {
  const files = Array.from(fileList || []);
  const errors = [];

  if (files.length === 0) {
    errors.push('Please select at least one file.');
  }
  if (files.length > MAX_FILES_PER_UPLOAD) {
    errors.push(`Too many files. Max allowed is ${MAX_FILES_PER_UPLOAD}.`);
  }

  for (const f of files) {
    const ext = f.name.toLowerCase().split('.').pop();

    const isZip = ext === 'zip';

    if (!ALLOWED_EXTS.has(ext)) {
      errors.push(`Unsupported type: ${f.name}`);
      continue;
    }

    if (f.size > MAX_FILE_SIZE_MB * MB) {
      errors.push(
        `File too large: ${f.name} (${(f.size / MB).toFixed(1)}MB). Max ${MAX_FILE_SIZE_MB}MB.`
      );
    }

    // warn if zip doesn't look like a shapefile (optional)
    if (isZip && !f.name.match(/shp|shape/i)) {
      console.warn(`Note: ${f.name} is a zip file — assuming shapefile container.`);
    }
  }

  return errors;
}
