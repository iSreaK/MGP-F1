import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const dest = path.join(root, 'dist/albert-park');
await mkdir(path.join(dest, 'data'), { recursive: true });
const source = path.join(import.meta.dirname, 'source');
const readJson = async name => JSON.parse(await readFile(path.join(source, name), 'utf8'));
const drivers = await readJson('drivers.json');
const results = await readJson('results.json');
let gridRows;
try{gridRows=await readJson('starting-grid.json');}catch{
const gridHtml = await readFile(path.join(source, 'starting-grid.html'), 'utf8');
gridRows = [...gridHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(row =>
  [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(cell => cell[1].replace(/<[^>]*>/g, '').trim()));
await writeFile(path.join(source,'starting-grid.json'),JSON.stringify(gridRows.filter(row=>/^\d+$/.test(row[0])),null,2));
}
const grid = new Map(gridRows.filter(row => /^\d+$/.test(row[0]) && /^\d+$/.test(row[1]))
  .map(row => [Number(row[1]), Number(row[0])]));
if (grid.size !== 22) throw new Error(`Expected 22 official grid positions, got ${grid.size}`);
const { carCatalog } = await import('../../dist/car-catalog.js');
const models = new Map(carCatalog.map(car => [car.number, car.key]));
const ordered = [...results].sort((a,b) => (a.position || 999) - (b.position || 999)
  || b.number_of_laps - a.number_of_laps);
const roster = ordered.map((result, i) => {
  const driver = drivers.find(row => row.driver_number === result.driver_number);
  const status = result.dns ? 'dns' : result.dnf || !result.position ? 'retired' : 'finished';
  return { replayNumber: result.driver_number,
    name: driver.first_name + ' ' + driver.last_name,
    gridPosition: grid.get(result.driver_number), finalPosition: i + 1,
    team2026: driver.team_name, modelKey: models.get(result.driver_number) || null,
    completedLaps: result.number_of_laps, status };
}).sort((a,b) => a.gridPosition - b.gridPosition);
await writeFile(path.join(dest, 'replay-roster.js'),
  `// Official F1 starting grid and OpenF1 11234 classification, Australian GP 2026.\n` +
  `// Model identities remain those of the existing garage; Hadjar has no local asset.\n` +
  `export const ALBERT_PARK_2026_ROSTER = Object.freeze(${JSON.stringify(roster,null,2)});\n` +
  `export const ALBERT_PARK_2026_DISPLAYED = Object.freeze(ALBERT_PARK_2026_ROSTER.filter(d => d.modelKey));\n` +
  `export const ALBERT_PARK_2026_BY_NUMBER = Object.freeze(Object.fromEntries(ALBERT_PARK_2026_ROSTER.map(d => [d.replayNumber,d])));\n` +
  `export const ALBERT_PARK_2026_TRACK_LENGTH_METERS = 5278;\n` +
  `export const ALBERT_PARK_2026_CONTROL_LINE_OFFSET_METERS = 0;\n`);

// These circuit-specific modules are maintained directly: regenerating a
// roster must never restore Austin's pit layout or eager GLB loading.
for (const nativeFile of ['main.js','grid-details.js','replay-lanes.js','index.html']) {
  await readFile(path.join(dest,nativeFile),'utf8');
}
for (const file of ['styles.css','race-motion.js','free-race-field.js','entity-spacing.js','sky.js','weather.js']) {
  let data = (await readFile(path.join(root,'dist/austin',file),'utf8')).replace(/\r\n/g,'\n');
  data = data.replaceAll('AUSTIN_2025','ALBERT_PARK_2026').replaceAll('AUSTIN_FINISH','ALBERT_PARK_FINISH')
    .replaceAll('Austin','AlbertPark').replaceAll('AUSTIN','ALBERT PARK').replaceAll('austin-2025','albert-park-2026')
    .replaceAll('Circuit of The Americas','Albert Park Grand Prix Circuit')
    .replaceAll('Circuit of the Americas','Albert Park Grand Prix Circuit')
    .replaceAll('CIRCUIT OF THE AMERICAS','ALBERT PARK GRAND PRIX CIRCUIT')
    .replaceAll('COTA','ALBERT PARK').replaceAll('États-Unis','Australie')
    .replaceAll('5513','5278').replaceAll('5,513','5,278').replaceAll('5,51 KM','5,28 KM')
    .replaceAll('2025','2026');
  if (file === 'sky.js') data = data.replace('SphereGeometry(6000','SphereGeometry(12000')
    .replace('Soft October daylight over the open Albert Park Grand Prix Circuit landscape.', 'Soft March daylight over Albert Park, Melbourne.');
  await writeFile(path.join(dest,file),data);
}
await writeFile(path.join(dest,'styles.css'), await readFile(path.join(dest,'styles.css'),'utf8') +
  '\n.venue-note,.map-attribution{font-size:10px;line-height:1.45;color:#b8c8c9;margin:8px 0 0}.map-attribution a{color:inherit}.brand-mark{font-size:23px}\n');
console.log('Albert Park viewer prepared; 22 official entrants, 21 garage models, 20 starters.');
