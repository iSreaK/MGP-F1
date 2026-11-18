// Optional source refresh. The viewer does not call an external data API.
import fs from 'node:fs/promises';
const directory = new URL('./sources/', import.meta.url);
await fs.mkdir(directory, { recursive: true });
const headers = { 'User-Agent': 'MGP-F1-GeometryResearch/1.0' };
const source = 'https://api.openstreetmap.org/api/0.6/node/5443064309';
const response = await fetch(source, { headers, signal: AbortSignal.timeout(15000) });
if (!response.ok) throw new Error(source + ': ' + response.status);
const xml = await response.text();
const coordinates = [+xml.match(/ lon="([^"]+)"/)[1], +xml.match(/ lat="([^"]+)"/)[1]];
await fs.writeFile(new URL('artwork-osm.json', directory), JSON.stringify({
  source: 'https://www.openstreetmap.org/node/5443064309',
  licence: 'ODbL 1.0 — © OpenStreetMap contributors',
  retrieved: new Date().toISOString().slice(0, 10), name: 'Der Bulle vom Spielberg', coordinates,
  note: 'Only the position is used. Dates and dimensions come from the venue, not OSM.',
}, null, 2));
const hotelUrl = 'https://nominatim.openstreetmap.org/search?q=Sch%C3%B6nberghof%20Spielberg&format=jsonv2&limit=1';
const hotelResponse = await fetch(hotelUrl, { headers, signal: AbortSignal.timeout(15000) });
if (!hotelResponse.ok) throw new Error('Hotel geocoding: ' + hotelResponse.status);
await fs.writeFile(new URL('schonberghof-osm.json', directory), JSON.stringify(await hotelResponse.json(), null, 2));
console.log('Updated the two OSM positions; building form remains a documented procedural approximation.');
