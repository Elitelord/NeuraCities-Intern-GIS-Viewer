// converters/geojsonConverters.js
import JSZip from 'jszip';
import html2canvas from 'html2canvas';

// import shpwrite from 'shp-write';

function bboxOfGeoJSON(fc) {
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  function visitCoords(coords){
    if (typeof coords[0] === 'number') {
      const [lng,lat]=coords;
      minX=Math.min(minX,lng); minY=Math.min(minY,lat);
      maxX=Math.max(maxX,lng); maxY=Math.max(maxY,lat);
    } else coords.forEach(visitCoords);
  }
  fc.features.forEach(f=>{
    if (!f.geometry) return;
    const g=f.geometry;
    if (g.type==='Point') visitCoords(g.coordinates);
    else visitCoords(g.coordinates);
  });
  if (!isFinite(minX)) { minX=-180; minY=-90; maxX=180; maxY=90; }
  return [minX,minY,maxX,maxY];
}

function coordsToSvgPath(coords, proj) {
  if (typeof coords[0] === 'number') {
    const [x,y] = proj(coords);
    return `${x} ${y}`;
  }
  return coords.map(r => coordsToSvgPath(r, proj)).map(s => 'M ' + s).join(' ');
}

/**
 * Render GeoJSON to PNG by drawing into an SVG and rasterizing it.
 * - No basemap tiles.
 */
export async function geojsonToPNG_SVG(fc, opts = {}) {
  const { width = 1200, height = 800, padding = 20, nameField } = opts;
  if (!fc || fc.type !== 'FeatureCollection') throw new Error('Expected FeatureCollection');

  const [minX,minY,maxX,maxY] = bboxOfGeoJSON(fc);
  const dataW = maxX - minX || 1;
  const dataH = maxY - minY || 1;

  // We'll use a simple equirectangular mapping (lon/lat -> linear) which is okay for many extents.
  // For more accurate world-scale rendering, use Web Mercator projection. Below is Web Mercator conversions:
  const lonToX = lon => ( (lon - minX) / dataW ) * (width - padding*2) + padding;
  const latToY = lat => {
    // approximate Web Mercator Y
    const mercY = (Math.log(Math.tan((Math.PI/4) + (lat * Math.PI/180)/2)));
    // compute min/max mercY for bbox for consistent scaling
    const mercMinY = Math.log(Math.tan((Math.PI/4) + (minY * Math.PI/180)/2));
    const mercMaxY = Math.log(Math.tan((Math.PI/4) + (maxY * Math.PI/180)/2));
    return ((mercMaxY - mercY) / (mercMaxY - mercMinY || 1)) * (height - padding*2) + padding;
  };
  const proj = ([lon,lat]) => [lonToX(lon), latToY(lat)];

  // build svg content
  const svgParts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`];

  for (const f of fc.features) {
    if (!f.geometry) continue;
    const g = f.geometry;
    if (g.type === 'Point') {
      const [x,y] = proj(g.coordinates);
      svgParts.push(`<circle cx="${x}" cy="${y}" r="4" fill="#ff5722" stroke="#c1411a" stroke-width="1"/>`);
    } else if (g.type === 'LineString') {
      const path = g.coordinates.map(c => proj(c).join(',')).join(' ');
      svgParts.push(`<polyline points="${path}" fill="none" stroke="#2b8cbe" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`);
    } else if (g.type === 'Polygon') {
      for (const ring of g.coordinates) {
        const path = ring.map(c => proj(c).join(',')).join(' ');
        svgParts.push(`<polygon points="${path}" fill="#2b8cbe" fill-opacity="0.16" stroke="#2b8cbe" stroke-width="1"/>`);
      }
    } else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates) {
        for (const ring of poly) {
          const path = ring.map(c => proj(c).join(',')).join(' ');
          svgParts.push(`<polygon points="${path}" fill="#2b8cbe" fill-opacity="0.16" stroke="#2b8cbe" stroke-width="1"/>`);
        }
      }
    } else if (g.type === 'MultiLineString') {
      for (const ln of g.coordinates) {
        const path = ln.map(c => proj(c).join(',')).join(' ');
        svgParts.push(`<polyline points="${path}" fill="none" stroke="#2b8cbe" stroke-width="2"/>`);
      }
    }
  }

  svgParts.push('</svg>');
  const svgStr = svgParts.join('');
  const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = (e) => rej(new Error('SVG -> Image load failed'));
      i.src = url;
      // important: do NOT set crossOrigin (we created the blob locally)
    });

    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(b => {
        if (!b) reject(new Error('Canvas produced null blob'));
        else resolve(b);
      }, 'image/png');
    });
    const filename = `${sanitizeName((fc.metadata && fc.metadata.name) || nameField || 'map_export')}.png`;
    return { blob, filename };
  } finally {
    try { URL.revokeObjectURL(url); } catch(e) {}
  }
}
/**
 * Capture the map (tiles + vectors) using Leaflet and html2canvas.
 * - fc: GeoJSON FeatureCollection
 * - options: { width, height, fitBounds, tileUrl, tileOptions, nameField }
 *
 * IMPORTANT: tileUrl must come from a CORS-enabled tile provider (or canvas will be tainted).
 */
export async function geojsonToPNG_MapCapture(fc, opts = {}) {
  const { width = 1200, height = 800, fitBounds = true,
          tileUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
          tileOptions = {}, nameField } = opts;
  if (!fc || fc.type !== 'FeatureCollection') throw new Error('Expected GeoJSON FeatureCollection');

  // create offscreen container
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  document.body.appendChild(container);

  try {
    if (!window.L) throw new Error('Leaflet (window.L) is required for map capture.');

    const map = window.L.map(container, { zoomControl: false, attributionControl: false, interactive: false }).setView([0,0], 2);

    // Ensure crossOrigin where possible; html2canvas will attempt useCORS
    const tileLayer = window.L.tileLayer(tileUrl, { ...tileOptions, maxZoom: 19 });
    tileLayer.addTo(map);

    const geojsonLayer = window.L.geoJSON(fc, {
      style: () => ({ color: '#2b8cbe', weight: 2, fillOpacity: 0.25 }),
      pointToLayer: (f, latlng) => window.L.circleMarker(latlng, { radius: 5 })
    }).addTo(map);

    if (fitBounds && geojsonLayer.getBounds && geojsonLayer.getBounds().isValid && !geojsonLayer.getBounds().isValid()) {
      map.setView([0,0], 2);
    } else if (fitBounds && geojsonLayer.getBounds) {
      try { map.fitBounds(geojsonLayer.getBounds(), { padding: [20,20] }); } catch(e) {}
    }

    // Wait some time for tiles to load. Increase if slow connections.
    await new Promise(res => setTimeout(res, 900));

    // capture with html2canvas. useCORS helps but requires tile server CORS.
    const canvas = await html2canvas(container, { useCORS: true, backgroundColor: null, scale: 1 });

    // toBlob may be null if canvas tainted -> handle explicitly
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => {
        if (!b) reject(new Error('Canvas capture produced null blob. Canvas may be tainted by cross-origin tiles.'));
        else resolve(b);
      }, 'image/png');
    });

    const filename = `${sanitizeName((fc.metadata && fc.metadata.name) || nameField || 'map_export')}.png`;
    map.remove();
    return { blob, filename };
  } finally {
    try { document.body.removeChild(container); } catch(e) {}
  }
}
/**
 * Escape CSV cell
 */
function sanitizeName(name){ return (name||'export').replace(/\s+/g,'_').replace(/[\\\/:*?"<>|]/g,'').slice(0,120); }
function escapeCsvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes('"')) return `"${s.replace(/"/g, '""')}"`;
  if (s.includes(',') || s.includes('\n') || s.includes('\r')) return `"${s}"`;
  return s;
}
export function geojsonToShapefile(fc, opts = {}) {
  if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
    throw new Error('Expected a GeoJSON FeatureCollection');
  }

  // Normalize properties: shp-write expects an object: {type: 'FeatureCollection', features: [...]}
  try {
    // shp-write expects a plain GeoJSON object. Its zip() function returns a JSZip instance or a Blob depending on version.
    // The simplest approach: call shpwrite.zip(fc) and coerce to Blob if necessary.
    const zipData = shpwrite.zip(fc); // usually returns a Blob (browser) or Uint8Array
    let blob;
    if (zipData instanceof Blob) {
      blob = zipData;
    } else if (zipData instanceof ArrayBuffer || ArrayBuffer.isView(zipData)) {
      blob = new Blob([zipData], { type: 'application/zip' });
    } else {
      // If shp-write returned a JSZip object, generate a blob via generateAsync
      if (zipData && typeof zipData.generateAsync === 'function') {
        // zipData is a JSZip instance
        // generateAsync returns a promise; return a promise-based signature
        return zipData.generateAsync({ type: 'blob', compression: 'DEFLATE' }).then((b) => {
          const filename = `${(fc.metadata && fc.metadata.name) ? fc.metadata.name.replace(/\s+/g, '_') : 'export'}.zip`;
          return { blob: b, filename };
        });
      }
      // fallback: try JSON-stringify the returned object
      blob = new Blob([JSON.stringify(zipData)], { type: 'application/zip' });
    }

    const filename = `${(fc.metadata && fc.metadata.name) ? fc.metadata.name.replace(/\s+/g, '_') : 'export'}.zip`;
    return { blob, filename };
  } catch (err) {
    throw new Error('Failed to create shapefile: ' + (err.message || err));
  }
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
  ? `<description><![CDATA[<pre>${JSON.stringify(f.properties, null, 2)}</pre>]]></description>`
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