const EXT = (name) => name.toLowerCase().split('.').pop();
const STEM = (name) => {
  const p = name.toLowerCase().split('.');
  p.pop(); // remove extension
  return p.join('.');
};

/**
 * Groups uploaded files into logical datasets
 * Returns { datasets, errors }
 * - datasets: array of { kind, files[], label, size, previewable, warnings? }
 *   kind ∈ 'shapefile' | 'geojson' | 'csv' | 'excel' | 'kml' | 'kmz' | 'gpx' | 
 *         'geotiff' | 'autocad-dwg' | 'autocad-dxf' | 'geopackage' | 'geodatabase' | 'arcgis-map' |
 *         'arcgis-layer' | 'geopdf' | 'microstation' | 'lidar' | 'raster' | 
 *         'openstreetmap' | 'cityjson' | '3d-tiles' | 'topojson' | 'well-known' | 'gml' | 'unknown'
 */
export function groupFilesByDataset(fileList) {
  const files = Array.from(fileList || []);
  const errors = [];
  const datasets = [];

  // --- NEW: pull out zipped shapefiles first so the validator/router can accept them ---
  const zipShapefiles = [];
  const remaining = [];

  for (const f of files) {
    const ext = EXT(f.name);
    if (ext === 'zip') {
      // treat each .zip as a single shapefile dataset (the preview/parser will inspect contents)
      zipShapefiles.push(f);
    } else {
      remaining.push(f);
    }
  }

  // add each .zip as its own dataset
  for (const z of zipShapefiles) {
    const label = z.name.replace(/\.zip$/i, '');
    datasets.push({
      kind: 'shapefile',
      label,
      files: [z],
      size: z.size,
      previewable: true,
      // optional nudge: the actual contents are validated later in ShapefilePreview
      warnings: undefined
    });
  }

  // --- Existing behavior: group loose shapefile components by stem (.shp/.dbf/.shx/.prj/…) ---
  const byStem = new Map();
  const singles = [];

  for (const f of remaining) {
    const ext = EXT(f.name);
    if (['shp', 'dbf', 'shx', 'prj', 'sbn', 'sbx', 'cpg'].includes(ext)) {
      const key = STEM(f.name);
      if (!byStem.has(key)) byStem.set(key, []);
      byStem.get(key).push(f);
    } else {
      singles.push(f);
    }
  }

  // Process shapefile groups from loose parts
  for (const [stem, group] of byStem.entries()) {
    const lower = group.map(g => g.name.toLowerCase());
    const hasSHP = lower.some(n => n.endsWith('.shp'));
    const hasDBF = lower.some(n => n.endsWith('.dbf'));
    const hasSHX = lower.some(n => n.endsWith('.shx'));
    const hasPRJ = lower.some(n => n.endsWith('.prj'));

    if (hasSHP && hasDBF) {
      const totalSize = group.reduce((sum, f) => sum + f.size, 0);
      const warnings = [];
      if (!hasSHX) warnings.push('Missing .shx (index) file');
      if (!hasPRJ) warnings.push('Missing .prj (projection) file');

      datasets.push({
        kind: 'shapefile',
        label: stem,
        files: group,
        size: totalSize,
        previewable: true,
        warnings: warnings.length ? warnings : undefined
      });
    } else {
      const missing = [];
      if (!hasSHP) missing.push('.shp');
      if (!hasDBF) missing.push('.dbf');
      errors.push(
        `Shapefile set "${stem}" is incomplete. Missing: ${missing.join(', ')}. ` +
        `Need at least .shp and .dbf files.`
      );
    }
  }

  // Process single non-shapefile files
  for (const f of singles) {
    const ext = EXT(f.name);
    let kind = 'unknown';
    let previewable = false;
    let warnings = undefined;

    // Vector formats
    if (['geojson','json'].includes(ext)) {
      kind = 'geojson'; previewable = true;
    }
    else if (ext === 'kml') {
      kind = 'kml'; previewable = true;
    }
    else if (ext === 'kmz') {
      kind = 'kmz'; previewable = true;
    }
    else if (ext === 'gpx') {
      kind = 'gpx'; previewable = true;
    }
    else if (ext === 'csv') {
      kind = 'csv'; previewable = true;
      warnings = ['Preview requires coordinate columns (lat/lon or geometry)'];
    }
    else if (['xlsx','xls'].includes(ext)) {
      kind = 'excel'; previewable = true;
      warnings = ['Preview requires coordinate columns (lat/lon or geometry)'];
    }

    // Raster formats
    else if (['tif','tiff'].includes(ext)) {
      kind = 'geotiff'; previewable = false;
      warnings = ['Raster preview not yet supported - conversion available'];
    }

    // CAD formats
    else if (ext === 'dwg') {
      kind = 'autocad-dwg'; previewable = false;
      warnings = ['CAD preview not yet supported - conversion available'];
    }
    else if (ext === 'dxf') {
      kind = 'autocad-dxf'; previewable = false;
      warnings = ['CAD preview not yet supported - conversion available'];
    }

    // Database formats
    else if (ext === 'gpkg') {
      kind = 'geopackage'; previewable = false;
      warnings = ['Database preview not yet supported - conversion available'];
    }
    else if (ext === 'gdb') {
      kind = 'geodatabase'; previewable = false;
      warnings = ['Geodatabase preview not yet supported - conversion available'];
    }

    // ArcGIS formats
    else if (['mxd','aprx'].includes(ext)) {
      kind = 'arcgis-map'; previewable = false;
      warnings = ['ArcGIS map document preview not yet supported'];
    }
    else if (['lyr','lyrx'].includes(ext)) {
      kind = 'arcgis-layer'; previewable = false;
      warnings = ['ArcGIS layer preview not yet supported'];
    }

    // PDF formats
    else if (['pdf','pdfx'].includes(ext)) {
      kind = 'geopdf'; previewable = false;
      warnings = ['GeoPDF preview not yet supported - conversion available'];
    }

    // Other formats
    else if (ext === 'dgnlib') {
      kind = 'microstation'; previewable = false;
      warnings = ['MicroStation preview not yet supported'];
    }
    else if (['las','laz'].includes(ext)) {
      kind = 'lidar'; previewable = false;
      warnings = ['LiDAR point cloud preview not yet supported'];
    }
    else if (['hdf','img','nc','nc4'].includes(ext)) {
      kind = 'raster'; previewable = false;
      warnings = ['Raster format preview not yet supported'];
    }
    else if (ext === 'osm') {
      kind = 'openstreetmap'; previewable = false;
      warnings = ['OSM preview not yet supported - conversion available'];
    }
    else if (ext === 'cityjson') {
      kind = 'cityjson'; previewable = false;
      warnings = ['CityJSON 3D preview not yet supported - conversion available'];
    }
    else if (['gltf','glb'].includes(ext)) {
      kind = '3d-tiles'; previewable = false;
      warnings = ['3D tiles preview not yet supported'];
    }
    else if (ext === 'topojson') {
      kind = 'topojson'; previewable = false;
      warnings = ['TopoJSON preview not yet supported - conversion available'];
    }
    else if (['wkt','wkb'].includes(ext)) {
      kind = 'well-known'; previewable = false;
      warnings = ['Well-Known format preview not yet supported'];
    }
    else if (ext === 'gml') {
      kind = 'gml'; previewable = false;
      warnings = ['GML preview not yet supported - conversion available'];
    }

    datasets.push({
      kind,
      label: f.name,
      files: [f],
      size: f.size,
      previewable,
      warnings
    });
  }

  return { datasets, errors };
}

/**
 * Get human-readable label for dataset kind
 */
export function getDatasetKindLabel(kind) {
  const labels = {
    'shapefile': 'Shapefile',
    'geojson': 'GeoJSON',
    'kml': 'KML',
    'kmz': 'KMZ',
    'gpx': 'GPX',
    'csv': 'CSV',
    'excel': 'Excel Spreadsheet',
    'geotiff': 'GeoTIFF Raster',
    'autocad-dwg': 'AutoCAD DWG',
    'autocad-dxf': 'AutoCAD DXF',
    'geopackage': 'GeoPackage',
    'geodatabase': 'File Geodatabase',
    'arcgis-map': 'ArcGIS Map Document',
    'arcgis-layer': 'ArcGIS Layer',
    'geopdf': 'GeoPDF',
    'microstation': 'MicroStation',
    'lidar': 'LiDAR Point Cloud',
    'raster': 'Raster Image',
    'openstreetmap': 'OpenStreetMap',
    'cityjson': 'CityJSON',
    '3d-tiles': '3D Tiles',
    'topojson': 'TopoJSON',
    'well-known': 'Well-Known Format',
    'gml': 'GML',
    'unknown': 'Unknown Format'
  };
  return labels[kind] || 'Unknown';
}

/**
 * Get icon/emoji for dataset kind
 */
export function getDatasetIcon(kind) {
  const icons = {
    'shapefile': '📊',
    'geojson': '🗺️',
    'kml': '📍',
    'kmz': '📍',
    'gpx': '🛰️',
    'csv': '📋',
    'excel': '📈',
    'geotiff': '🖼️',
    'autocad-dwg': '📐',
    'autocad-dxf': '📐',
    'geopackage': '📦',
    'geodatabase': '🗄️',
    'arcgis-map': '🗺️',
    'arcgis-layer': '🎨',
    'geopdf': '📄',
    'microstation': '🏗️',
    'lidar': '📡',
    'raster': '🖼️',
    'openstreetmap': '🗺️',
    'cityjson': '🏙️',
    '3d-tiles': '🏢',
    'topojson': '🗺️',
    'well-known': '📝',
    'gml': '📝',
    'unknown': '❓'
  };
  return icons[kind] || '📁';
}
