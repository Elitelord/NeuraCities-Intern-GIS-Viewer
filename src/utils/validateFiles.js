const MB = 1024 * 1024;

export const MAX_FILE_SIZE_MB = 200;     // per-file limit
export const MAX_FILES_PER_UPLOAD = 50;

const ALLOWED_EXTS = new Set([
  'shp','dbf','shx','prj','json','geojson','csv','xlsx','xls',
  // roadmap (won't preview yet, but we accept uploads)
  'kml','kmz','gpx','tif','tiff','dwg','dxf','gpkg','gdb','mxd','aprx','lyr','lyrx','pdf','pdfx','dgnlib','las','laz','hdf','img','osm','cityjson'
]);

export function validateRawFiles(fileList) {
  const files = Array.from(fileList || []);
  const errors = [];

  if (files.length === 0) errors.push('Please select at least one file.');
  if (files.length > MAX_FILES_PER_UPLOAD) {
    errors.push(`Too many files. Max allowed is ${MAX_FILES_PER_UPLOAD}.`);
  }

  for (const f of files) {
    const ext = f.name.toLowerCase().split('.').pop();
    if (!ALLOWED_EXTS.has(ext)) errors.push(`Unsupported type: ${f.name}`);
    if (f.size > MAX_FILE_SIZE_MB * MB) {
      errors.push(`File too large: ${f.name} (${(f.size/MB).toFixed(1)}MB). Max ${MAX_FILE_SIZE_MB}MB.`);
    }
  }

  return errors;
}
