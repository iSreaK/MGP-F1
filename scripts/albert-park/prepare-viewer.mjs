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

for (const file of ['styles.css','race-motion.js','free-race-field.js','entity-spacing.js','sky.js','weather.js','main.js','grid-details.js','replay-lanes.js','index.html']) {
  let data = (await readFile(path.join(root,'dist/austin',file),'utf8')).replace(/\r\n/g,'\n');
  data = data.replaceAll('AUSTIN_2025','ALBERT_PARK_2026').replaceAll('AUSTIN_FINISH','ALBERT_PARK_FINISH')
    .replaceAll('Austin','AlbertPark').replaceAll('AUSTIN','ALBERT PARK').replaceAll('austin-2025','albert-park-2026')
    .replaceAll('Circuit of The Americas','Albert Park Grand Prix Circuit')
    .replaceAll('Circuit of the Americas','Albert Park Grand Prix Circuit')
    .replaceAll('CIRCUIT OF THE AMERICAS','ALBERT PARK GRAND PRIX CIRCUIT')
    .replaceAll('COTA','ALBERT PARK').replaceAll('États-Unis','Australie')
    .replaceAll('5513','5278').replaceAll('5,513','5,278').replaceAll('5,51 KM','5,28 KM')
    .replaceAll('2025','2026');
  if (file === 'main.js') {
    data = data.replace("import * as THREE from 'three';", "import * as THREE from 'three';\nimport { frameCircuitOverview } from '../circuit-framing.js';")
      .replace(/    initialTarget\.set\(center\.x, center\.y, center\.z\);[\s\S]*?    camera\.position\.copy\(initialPosition\);/, '    frameCircuitOverview(THREE, camera, world.bounds, initialPosition, initialTarget);\n    camera.position.copy(initialPosition);')
      .replace('let replayTotalLaps = 56;', 'let replayTotalLaps = 58;')
      .replace('gridU: world.gridU, trackLengthMeters: trackGap.lengthMeters,',
        'gridU: world.gridU, trackLengthMeters: 5278,')
      .replace('ALBERT_PARK_2026_ROSTER.some(driver => !replayData.drivers[driver.replayNumber])',
        "ALBERT_PARK_2026_ROSTER.filter(driver => driver.status !== 'dns').some(driver => !replayData.drivers[driver.replayNumber])")
      .replace('`${carCatalog.length} MODÈLES / 20 PILOTES`', "'19 MODÈLES / 20 PARTANTS'")
      .replace('dont 19 représentés en 3D', 'dont 19 représentés en 3D ; deux non-partants')
      .replace('selectedReplayNumber = requestedReplayNumber;\n      historicalReplay.setSpeed',
        'selectedReplayNumber = replayData.drivers[requestedReplayNumber] ? requestedReplayNumber : 3;\n      for (const [number, instance] of carInstances) instance.controller.car.visible = !!replayData.drivers[number];\n      historicalReplay.setSpeed')
      .replace('renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));',
        'renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));')
      .replace('renderer.shadowMap.enabled = true;', 'renderer.shadowMap.enabled = true;')
      .replace('sun.shadow.mapSize.set(2048, 2048);','sun.shadow.mapSize.set(1024, 1024);')
      .replace('controls.maxDistance = 5200;', 'controls.maxDistance = 11000;')
      .replace('new THREE.PerspectiveCamera(41, 1, 0.5, 6500)', 'new THREE.PerspectiveCamera(41, 1, 0.5, 16000)')
      .replace('let introPlayed = false;', "let introPlayed = !focusCarKey;")
      .replace('new THREE.Fog(0xc4c9b8, 2800, 8000)', 'new THREE.Fog(0xbdced4, 8000, 20000)')
      .replace('0xc4c9b8);', '0xbdced4);')
      .replace('sky.follow(camera.position);',
        `world?.environment?.update?.(now / 1000);
    for (const [number, instance] of carInstances) {
      const car = instance.controller.car;
      const replayDriver = historicalReplay?.data.drivers[number];
      const ended = replayActive && (!replayDriver || replayDriver.status === 'dns' || historicalReplay.timeSec > replayDriver.finishSec + 1);
      car.visible = !ended && camera.position.distanceTo(car.position) < 850;
    }
    sky.follow(camera.position);`);
  }
  if (file === 'grid-details.js') {
    data = data.replace('ALBERT_PARK_FINISH_BEFORE_START_METERS = 323','ALBERT_PARK_FINISH_BEFORE_START_METERS = 0')
      .replace('position < 20','position < 22').replace('GRID_SLOT_SPACING = 7.91','GRID_SLOT_SPACING = 8.19')
      .replace('length: 34','length: 41').replace('const bayLength = 11.1','const bayLength = 8.8')
      .replace("fillText('MSC CRUISES'", "fillText('AUSTRALIAN GRAND PRIX'")
      .replace('56 × 5,278 m minus the official 308.405 km race distance gives 323 m from\n// control line to standing-start line in the direction of travel.',
        'The FIA 2026 competition visa places start and control on the same line.');
  }
  if (file === 'sky.js') data = data.replace('SphereGeometry(6000','SphereGeometry(12000')
    .replace('Soft October daylight over the open Albert Park Grand Prix Circuit landscape.', 'Soft March daylight over Albert Park, Melbourne.');
  if (file === 'index.html') {
    data = data.replaceAll('AlbertPark','Albert Park')
      .replaceAll('ALBERT PARK · ALBERT PARK','ALBERT PARK · MELBOURNE')
      .replaceAll('du Albert Park Grand Prix Circuit à Albert Park','d’Albert Park à Melbourne').replaceAll('2026 : 19 des 20 pilotes','2026 : 19 des 20 partants')
      .replace('Isack Hadjar figure au classement sans modèle 3D.',
        'Hadjar figure au classement sans modèle 3D. Piastri et Hülkenberg sont non-partants.')
      .replace('Piste permanente · montée vers le virage 1','Lac, parc et skyline de Melbourne · tracé horaire')
      .replace('<strong>20</strong><span>VIRAGES</span>','<strong>14</strong><span>VIRAGES</span>')
      .replace('<span class="brand-mark" aria-hidden="true">A</span>','<span class="brand-mark" aria-hidden="true">AP</span>')
      .replace('aria-current="page"','')
      .replace('</section>\n\n      <section class="race-hud"',
        '<p class="venue-note">Relief naturel ≈ 2,6 m · représentation des bâtiments et largeurs indicative.</p><p class="map-attribution">Géographie © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></p></section>\n\n      <section class="race-hud"');
  }
  await writeFile(path.join(dest,file),data);
}
await writeFile(path.join(dest,'styles.css'), await readFile(path.join(dest,'styles.css'),'utf8') +
  '\n.venue-note,.map-attribution{font-size:10px;line-height:1.45;color:#b8c8c9;margin:8px 0 0}.map-attribution a{color:inherit}.brand-mark{font-size:23px}\n');
console.log('Albert Park viewer prepared; 22 official entrants, 21 garage models, 20 starters.');
