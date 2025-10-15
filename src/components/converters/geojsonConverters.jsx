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

export function geojsonToGPX(fc, opts = {}) {
  const { nameField = 'name', includeProperties = true } = opts;

  if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
    throw new Error('Expected a GeoJSON FeatureCollection');
  }

  const esc = (s) => (s == null ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'));

  // helper: format lat/lon (GPX uses lat/lon attributes)
  const fmtCoord = (c) => (Number.isFinite(Number(c)) ? Number(c) : '');

  // Build wpt entries and trk entries
  const wpts = [];
  const trks = [];

  function propertiesDesc(props) {
    if (!props) return '';
    try {
      if (includeProperties) return `<desc><![CDATA[${JSON.stringify(props, null, 2)}]]></desc>`;
    } catch (e) {
      return `<desc>${esc(String(props))}</desc>`;
    }
    return '';
  }

  let trackCount = 0;
  fc.features.forEach((f, idx) => {
    if (!f || !f.geometry) return;
    const p = f.properties || {};
    const title = (p[nameField] ?? p.title ?? `feature-${idx+1}`);
    const nameXml = `<name>${esc(title)}</name>`;
    const descXml = propertiesDesc(p);

    const geom = f.geometry;
    const type = geom.type;

    if (type === 'Point') {
      const [lng, lat] = geom.coordinates || [];
      if (lat == null || lng == null) return;
      wpts.push(`<wpt lat="${fmtCoord(lat)}" lon="${fmtCoord(lng)}">${nameXml}${descXml}</wpt>`);
      return;
    }

    if (type === 'MultiPoint') {
      (geom.coordinates || []).forEach((c, i) => {
        const [lng, lat] = c || [];
        if (lat == null || lng == null) return;
        wpts.push(`<wpt lat="${fmtCoord(lat)}" lon="${fmtCoord(lng)}"><name>${esc(`${title}-${i+1}`)}</name>${descXml}</wpt>`);
      });
      return;
    }

    // Lines -> tracks
    const coordsToTrkseg = (coords) => {
      // coords is array of [lng,lat] pairs
      const pts = (coords || []).map(c => {
        if (!Array.isArray(c)) return '';
        const [lng, lat] = c;
        if (lat == null || lng == null) return '';
        return `<trkpt lat="${fmtCoord(lat)}" lon="${fmtCoord(lng)}"></trkpt>`;
      }).filter(Boolean);
      if (!pts.length) return '';
      return `<trkseg>${pts.join('')}</trkseg>`;
    };

    if (type === 'LineString') {
      const seg = coordsToTrkseg(geom.coordinates || []);
      if (seg) {
        trackCount++;
        trks.push(`<trk><name>${esc(title)}</name>${descXml}${seg}</trk>`);
      }
      return;
    }

    if (type === 'MultiLineString') {
      const segs = (geom.coordinates || []).map(coordsToTrkseg).filter(Boolean);
      if (segs.length) {
        trackCount++;
        trks.push(`<trk><name>${esc(title)}</name>${descXml}${segs.join('')}</trk>`);
      }
      return;
    }

    if (type === 'Polygon') {
      // export outer ring as a single track
      const rings = geom.coordinates || [];
      if (rings.length) {
        const outer = rings[0] || [];
        const seg = coordsToTrkseg(outer);
        if (seg) {
          trackCount++;
          trks.push(`<trk><name>${esc(title)}</name>${descXml}${seg}</trk>`);
        }
      }
      return;
    }

    if (type === 'MultiPolygon') {
      const polys = geom.coordinates || [];
      const polySegs = [];
      polys.forEach(poly => {
        const outer = (poly && poly[0]) || [];
        const seg = coordsToTrkseg(outer);
        if (seg) polySegs.push(seg);
      });
      if (polySegs.length) {
        trackCount++;
        trks.push(`<trk><name>${esc(title)}</name>${descXml}${polySegs.join('')}</trk>`);
      }
      return;
    }

    if (type === 'GeometryCollection') {
      (geom.geometries || []).forEach((g, subi) => {
        if (!g) return;
        const fakeFeature = { type: 'Feature', geometry: g, properties: p };
        // recursive-ish: process simple types inline
        if (g.type === 'Point') {
          const [lng, lat] = g.coordinates || [];
          if (lat != null && lng != null) wpts.push(`<wpt lat="${fmtCoord(lat)}" lon="${fmtCoord(lng)}"><name>${esc(`${title}-${subi+1}`)}</name>${descXml}</wpt>`);
        } else {
          // fallback: treat like LineString if possible
          if (Array.isArray(g.coordinates) && typeof g.coordinates[0][0] === 'number') {
            const seg = coordsToTrkseg(g.coordinates);
            if (seg) {
              trackCount++;
              trks.push(`<trk><name>${esc(`${title}-${subi+1}`)}</name>${descXml}${seg}</trk>`);
            }
          }
        }
      });
      return;
    }

    // unknown geometry: skip
  });

  const docName = (fc.metadata && fc.metadata.name) ? fc.metadata.name : 'Exported';
  const now = new Date().toISOString();

  const header = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="NeuraCities" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata>\n    <name>${esc(docName)}</name>\n    <desc>Converted from GeoJSON</desc>\n    <time>${now}</time>\n  </metadata>\n`;

  const body = [
    // waypoints first
    wpts.join('\n'),
    // then tracks
    trks.join('\n')
  ].filter(Boolean).join('\n');

  const footer = '\n</gpx>\n';

  const gpxText = header + body + footer;
  const filename = `${docName.replace(/\s+/g, '_')}.gpx`;

  return { gpxText, filename };
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