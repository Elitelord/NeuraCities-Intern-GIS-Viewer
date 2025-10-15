// converters/geojsonConverters.js
import JSZip from 'jszip';

/**
 * Escape CSV cell
 */
function escapeCsvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes('"')) return `"${s.replace(/"/g, '""')}"`;
  if (s.includes(',') || s.includes('\n') || s.includes('\r')) return `"${s}"`;
  return s;
}

/**
 * Convert GeoJSON FeatureCollection -> CSV Blob
 * options:
 *  - geometry: 'wkt' | 'latlng' (default 'wkt')  // how to include geometry
 *  - includeProperties: true/false
 */
export function geojsonToCSV(fc, opts = {}) {
  const { geometry = 'wkt', includeProperties = true } = opts;

  if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
    throw new Error('Expected a GeoJSON FeatureCollection');
  }

  // Collect property keys (union across features)
  const propKeys = new Set();
  fc.features.forEach(f => {
    const props = f.properties || {};
    Object.keys(props).forEach(k => propKeys.add(k));
  });
  const keys = Array.from(propKeys);

  // Build header
  const header = [];
  if (includeProperties && keys.length) header.push(...keys);
  // geometry columns
  if (geometry === 'latlng') {
    header.push('lng', 'lat');
  } else {
    header.push('geometry'); // WKT string
  }

  const lines = [header.join(',')];

  // Feature -> row
  const featureToRow = (f) => {
    const props = f.properties || {};
    const row = [];

    if (includeProperties && keys.length) {
      keys.forEach(k => {
        row.push(escapeCsvCell(props[k]));
      });
    }

    // geometry
    const g = f.geometry;
    if (!g) {
      // empty geometry
      if (geometry === 'latlng') {
        row.push('', '');
      } else {
        row.push('');
      }
      return row;
    }

    if (geometry === 'latlng' && g.type === 'Point' && Array.isArray(g.coordinates)) {
      row.push(String(g.coordinates[0] ?? ''), String(g.coordinates[1] ?? ''));
    } else {
      // produce WKT for common types
      function coordsToWkt(coord) {
        return coord.map(pt => `${pt[0]} ${pt[1]}`).join(', ');
      }
      let wkt = '';
      switch (g.type) {
        case 'Point':
          wkt = `POINT(${g.coordinates[0]} ${g.coordinates[1]})`;
          break;
        case 'LineString':
          wkt = `LINESTRING(${coordsToWkt(g.coordinates)})`;
          break;
        case 'Polygon':
          wkt = `POLYGON(${g.coordinates.map(r => `(${coordsToWkt(r)})`).join(',')})`;
          break;
        case 'MultiPoint':
          wkt = `MULTIPOINT(${g.coordinates.map(c => `(${c[0]} ${c[1]})`).join(',')})`;
          break;
        case 'MultiLineString':
          wkt = `MULTILINESTRING(${g.coordinates.map(r => `(${coordsToWkt(r)})`).join(',')})`;
          break;
        case 'MultiPolygon':
          wkt = `MULTIPOLYGON(${g.coordinates.map(poly => `(${poly.map(r => `(${coordsToWkt(r)})`).join(',')})`).join(',')})`;
          break;
        default:
          wkt = '';
      }
      row.push(escapeCsvCell(wkt));
    }
    return row;
  };

  fc.features.forEach(f => {
    const row = featureToRow(f);
    lines.push(row.join(','));
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const filename = `${(fc.metadata && fc.metadata.name) ? fc.metadata.name.replace(/\s+/g, '_') : 'export'}.csv`;
  return { blob, filename };
}

/**
 * Minimal KML generator from GeoJSON FeatureCollection
 * returns text (string)
 * Options:
 *  - nameField: property to use as placemark name
 */
export function geojsonToKML(fc, opts = {}) {
  const { nameField = 'name' } = opts;
  if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
    throw new Error('Expected a GeoJSON FeatureCollection');
  }

  const esc = (s) => (s == null ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'));
  const num = (x) => Number.isFinite(Number(x)) ? Number(x) : NaN;
  const isPair = (c) => Array.isArray(c) && Number.isFinite(num(c[0])) && Number.isFinite(num(c[1]));
  const joinPairs = (arr) => arr.map(c => `${num(c[0])},${num(c[1])}`).join(' ');
  const cleanRing = (ring) => Array.isArray(ring) ? ring.filter(isPair) : [];
  const cleanRings = (poly) => Array.isArray(poly) ? poly.map(cleanRing).filter(r => r.length >= 4) : [];

  const geomToKml = (g) => {
    if (!g) return '';

    switch (g.type) {
      case 'Point': {
        const c = g.coordinates;
        if (!isPair(c)) return '';
        return `<Point><coordinates>${num(c[0])},${num(c[1])}</coordinates></Point>`;
      }

      case 'MultiPoint': {
        const pts = (g.coordinates || []).filter(isPair);
        if (!pts.length) return '';
        return `<MultiGeometry>${pts.map(c =>
          `<Point><coordinates>${num(c[0])},${num(c[1])}</coordinates></Point>`
        ).join('')}</MultiGeometry>`;
      }

      case 'LineString': {
        const seg = (g.coordinates || []).filter(isPair);
        if (seg.length < 2) return '';
        return `<LineString><coordinates>${joinPairs(seg)}</coordinates></LineString>`;
      }

      case 'MultiLineString': {
        const lines = (g.coordinates || [])
          .map(seg => (seg || []).filter(isPair))
          .filter(seg => seg.length >= 2);
        if (!lines.length) return '';
        // ✅ Wrap multiple LineStrings
        return `<MultiGeometry>${lines.map(seg =>
          `<LineString><coordinates>${joinPairs(seg)}</coordinates></LineString>`
        ).join('')}</MultiGeometry>`;
      }

      case 'Polygon': {
        const rings = cleanRings(g.coordinates);
        if (!rings.length) return '';
        const [outer, ...inners] = rings;
        return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${joinPairs(outer)}</coordinates></LinearRing></outerBoundaryIs>${
          inners.map(r => `<innerBoundaryIs><LinearRing><coordinates>${joinPairs(r)}</coordinates></LinearRing></innerBoundaryIs>`).join('')
        }</Polygon>`;
      }

      case 'MultiPolygon': {
        const polys = (g.coordinates || []).map(cleanRings).filter(rs => rs.length);
        if (!polys.length) return '';
        // ✅ Wrap multiple Polygons
        return `<MultiGeometry>${polys.map(rings => {
          const [outer, ...inners] = rings;
          return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${joinPairs(outer)}</coordinates></LinearRing></outerBoundaryIs>${
            inners.map(r => `<innerBoundaryIs><LinearRing><coordinates>${joinPairs(r)}</coordinates></LinearRing></innerBoundaryIs>`).join('')
          }</Polygon>`;
        }).join('')}</MultiGeometry>`;
      }

      case 'GeometryCollection': {
        const parts = (g.geometries || []).map(geomToKml).filter(Boolean);
        return parts.length ? `<MultiGeometry>${parts.join('')}</MultiGeometry>` : '';
      }

      default:
        return '';
    }
  };

  const placemarks = [];
  fc.features.forEach((f, i) => {
    try {
      if (!f || f.type !== 'Feature') return;
      const geomXml = geomToKml(f.geometry);
      if (!geomXml) return;
      const name = (f.properties && (f.properties[nameField] ?? f.properties.title)) || `feature-${i+1}`;
      const desc = f.properties
        ? `<description><![CDATA<pre>${esc(JSON.stringify(f.properties, null, 2))}</pre>]]></description>`
        : '';
      placemarks.push(`<Placemark><name>${esc(name)}</name>${desc}${geomXml}</Placemark>`);
    } catch {
      /* skip bad feature */
    }
  });

  const docName = (fc.metadata && fc.metadata.name) ? fc.metadata.name : 'Exported';
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${esc(docName)}</name>
    ${placemarks.join('\n')}
  </Document>
</kml>`;

  const filename = `${docName.replace(/\s+/g, '_')}.kml`;
  return { kmlText: kml, filename };
}



/**
 * Convert GeoJSON -> KMZ (zip containing doc.kml)
 * returns { blob, filename }
 */
export async function geojsonToKMZ(fc, opts = {}) {
  const zip = new JSZip();
  const { kmlText, filename: kmlName } = geojsonToKML(fc, opts);

  // standard name in many tools is doc.kml inside the kmz
  zip.file('doc.kml', kmlText);

  // optional: include metadata.json with original properties/metadata
  try {
    const meta = {
      exportedAt: new Date().toISOString(),
      featureCount: Array.isArray(fc.features) ? fc.features.length : 0,
      metadata: fc.metadata || null
    };
    zip.file('metadata.json', JSON.stringify(meta, null, 2));
  } catch (e) { /* ignore */ }

  const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const filename = `${(fc.metadata && fc.metadata.name ? fc.metadata.name.replace(/\s+/g, '_') : 'export')}.kmz`;
  return { blob: content, filename };
}