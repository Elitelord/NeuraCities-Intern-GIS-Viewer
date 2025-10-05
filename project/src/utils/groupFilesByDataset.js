const EXT = (name) => name.toLowerCase().split('.').pop();
const STEM = (name) => {
  const p = name.toLowerCase().split('.');
  p.pop(); // remove extension
  return p.join('.');
};

/**
 * Returns { datasets, errors }
 * - datasets: array of { kind, files[], label }
 *   kind ∈ 'shapefile' | 'geojson' | 'csv' | 'excel' | 'unknown'
 */
export function groupFilesByDataset(fileList) {
  const files = Array.from(fileList || []);
  const byStem = new Map();
  const singles = [];
  const errors = [];

  for (const f of files) {
    const ext = EXT(f.name);
    if (['shp','dbf','shx','prj','sbn','sbx','cpg'].includes(ext)) {
      const key = STEM(f.name);
      if (!byStem.has(key)) byStem.set(key, []);
      byStem.get(key).push(f);
    } else {
      singles.push(f);
    }
  }

  const datasets = [];

  for (const [stem, group] of byStem.entries()) {
    const lower = group.map(g => g.name.toLowerCase());
    const hasSHP = lower.some(n => n.endsWith('.shp'));
    const hasDBF = lower.some(n => n.endsWith('.dbf'));

    if (hasSHP && hasDBF) {
      datasets.push({ kind: 'shapefile', label: stem, files: group });
    } else {
      errors.push(`Shapefile set "${stem}" is incomplete. Need at least .shp and .dbf.`);
    }
  }

  for (const f of singles) {
    const ext = EXT(f.name);
    if (['geojson','json'].includes(ext)) {
      datasets.push({ kind: 'geojson', label: f.name, files: [f] });
    } else if (ext === 'csv') {
      datasets.push({ kind: 'csv', label: f.name, files: [f] });
    } else if (['xlsx','xls'].includes(ext)) {
      datasets.push({ kind: 'excel', label: f.name, files: [f] });
    } else if (ext === 'kmz') {
      datasets.push({ kind: 'kmz', label: f.name, files: [f] });
    } else {
      datasets.push({ kind: 'unknown', label: f.name, files: [f] });
    }
  }

  return { datasets, errors };
}
