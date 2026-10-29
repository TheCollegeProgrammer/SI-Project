import topology from 'world-atlas/countries-110m.json';
import countryNames from '../data/countryNames.json';
import { feature } from 'topojson-client';
import { geoContains, geoBounds } from 'd3-geo';

const nameById = new Map(Object.entries(countryNames));
const geoCountries = feature(topology, topology.objects.countries).features.map(f => {
  const id = String(f.id).padStart(3, '0');
  const bounds = geoBounds(f);
  return { id, name: nameById.get(id) || f.properties?.name || `Country ${id}`, feature: f, bounds };
});

function containsBounds(bounds, lon, lat) {
  const [[west, south], [east, north]] = bounds;
  if (lat < south || lat > north) return false;
  if (west <= east) return lon >= west && lon <= east;
  return lon >= west || lon <= east; // dateline-crossing country
}

self.onmessage = (event) => {
  const rows = event.data.rows || [];
  const counts = new Map();
  let offshore = 0;
  for (let i = 0; i < rows.length; i++) {
    const lon = Number(rows[i].longitude);
    const lat = Number(rows[i].latitude);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    let found = null;
    for (const country of geoCountries) {
      if (!containsBounds(country.bounds, lon, lat)) continue;
      if (geoContains(country.feature, [lon, lat])) { found = country.name; break; }
    }
    if (found) counts.set(found, (counts.get(found) || 0) + 1);
    else offshore++;
    if (i > 0 && i % 5000 === 0) self.postMessage({ type: 'progress', processed: i, total: rows.length });
  }
  self.postMessage({ type: 'done', counts: Array.from(counts, ([country, count]) => ({ country, count })).sort((a,b) => b.count-a.count), offshore });
};
