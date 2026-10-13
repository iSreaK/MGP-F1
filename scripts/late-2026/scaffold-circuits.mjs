#!/usr/bin/env node
// Create the shared viewer shell for the three new 2026 circuits. Track data
// and relief are generated separately by generate-track-data.mjs.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const AUSTIN = path.join(ROOT, 'dist', 'austin');

const modelKeys = Object.freeze({
  3: 'redbull', 30: 'redbull-lawson', 44: 'ferrari', 16: 'ferrari-leclerc',
  10: 'alpine', 43: 'alpine-colapinto', 1: 'mclaren', 81: 'mclaren-piastri',
  12: 'mercedes', 63: 'mercedes-russell', 5: 'audi', 27: 'audi-hulkenberg',
  41: 'racingbulls-lindblad', 22: 'racingbulls-tsunoda', 87: 'haas-bearman',
  31: 'haas-ocon', 55: 'williams-sainz', 23: 'williams-albon',
  77: 'cadillac-bottas', 11: 'cadillac-perez', 18: 'astonmartin-stroll',
  14: 'astonmartin-alonso',
});

const circuits = [
  {
    slug: 'madrid', className: 'Madrid', upper: 'MADRID', display: 'Madrid',
    officialName: 'Madring · IFEMA Madrid', country: 'Espagne', length: 5414,
    lengthText: '5,414', turns: 22, laps: 57, finishBeforeStart: 245,
    gridSpacing: 8.1, gridLane: 2.15, pitSide: 1, pitLane: 15,
    groundColor: '0x73804b', shoulderColor: '0x777873', curbColor: '0xd52c36',
    accent: '0xe33b45', seed: 20260913, urban: true,
    event: 'Grand Prix d’Espagne 2026', location: 'Madrid',
    note: 'Circuit semi-urbain · dénivelé mesuré par OpenF1',
  },
  {
    slug: 'baku', className: 'Baku', upper: 'BAKU', display: 'Baku',
    officialName: 'Baku City Circuit', country: 'Azerbaïdjan', length: 6003,
    lengthText: '6,003', turns: 20, laps: 51, finishBeforeStart: 110,
    gridSpacing: 8.1, gridLane: 2.05, pitSide: -1, pitLane: -14.5,
    groundColor: '0x918a75', shoulderColor: '0x626463', curbColor: '0xc92b35',
    accent: '0x45a2bd', seed: 20260926, urban: true,
    event: 'Grand Prix d’Azerbaïdjan 2026', location: 'Bakou',
    note: 'Circuit urbain · vieille ville et boulevard maritime',
  },
  {
    slug: 'sepang', className: 'Sepang', upper: 'SEPANG', display: 'Sepang',
    officialName: 'Sepang International Circuit', country: 'Malaisie', length: 5543,
    lengthText: '5,543', turns: 15, laps: 56, finishBeforeStart: 185,
    gridSpacing: 8.15, gridLane: 2.2, pitSide: -1, pitLane: -15.5,
    groundColor: '0x47733f', shoulderColor: '0x777b73', curbColor: '0xd62d35',
    accent: '0x56a86a', seed: 20261004, urban: false,
    event: 'Grand Prix de Bahreïn en Malaisie 2026', location: 'Sepang',
    note: 'Circuit permanent · relief tropical mesuré par OpenF1',
  },
];

const titleCase = value => String(value).toLocaleLowerCase('fr-FR')
  .replace(/(^|[\s-])\p{L}/gu, char => char.toLocaleUpperCase('fr-FR'));

function rosterModule(config, archive) {
  const drivers = new Map(archive.drivers.map(driver => [driver.driver_number, driver]));
  drivers.set(22, drivers.get(22) || { first_name: 'Yuki', last_name: 'Tsunoda',
    team_name: 'Racing Bulls' });
  const results = archive.session_result.filter(result => modelKeys[result.driver_number]);
  for (const number of Object.keys(modelKeys).map(Number)) {
    if (!results.some(result => result.driver_number === number)) {
      results.push({ driver_number: number, position: null, number_of_laps: 0,
        dnf: false, dsq: false, dns: false });
    }
  }
  results.sort((a, b) => {
    const aPosition = Number.isFinite(a.position) ? a.position : 999;
    const bPosition = Number.isFinite(b.position) ? b.position : 999;
    return aPosition - bPosition || b.number_of_laps - a.number_of_laps;
  });
  const prefix = `${config.upper}_2026`;
  const rows = results.map((result, index) => {
    const driver = drivers.get(result.driver_number);
    const name = `${driver.first_name} ${titleCase(driver.last_name)}`;
    const status = result.dnf || result.dsq || result.dns ? ', status: \'retired\'' : '';
    const classification = index + 1;
    return `  { replayNumber: ${result.driver_number}, name: ${JSON.stringify(name)}, gridPosition: ${classification}, finalPosition: ${classification}, team2026: ${JSON.stringify(driver.team_name)}, modelKey: ${JSON.stringify(modelKeys[result.driver_number])}, completedLaps: ${result.number_of_laps}${status} },`;
  }).join('\n');
  return `// Grille d'affichage fondée sur la classification OpenF1 de ${config.event}.\n` +
`// Le replay historique détaillé n'est pas embarqué dans cette première version.\n` +
`export const ${prefix}_ROSTER = Object.freeze([\n${rows}\n]);\n\n` +
`export const ${prefix}_BY_NUMBER = Object.freeze(Object.fromEntries(\n` +
`  ${prefix}_ROSTER.map(driver => [driver.replayNumber, driver]),\n));\n` +
`export const ${prefix}_DISPLAYED = Object.freeze(${prefix}_ROSTER.filter(driver => driver.modelKey));\n` +
`export const ${prefix}_TRACK_LENGTH_METERS = ${config.length};\n` +
`export const ${prefix}_CONTROL_LINE_OFFSET_METERS = ${config.finishBeforeStart};\n`;
}

function worldModule(config) {
  return `import { TRACK_POINTS, TRACK_LENGTH_METERS, TRACK_WIDTH_METERS, LANDMARKS } from './track-data.js';\n` +
`import { prepare${config.className}Curve } from './geometry-smoothing.js';\n` +
`import { createLate2026World } from '../late-2026-world.js';\n\n` +
`export function create${config.className}World(THREE, scene) {\n` +
`  return createLate2026World(THREE, scene, {\n` +
`    slug: '${config.slug}', name: ${JSON.stringify(config.officialName)},\n` +
`    TRACK_POINTS, TRACK_LENGTH_METERS, TRACK_WIDTH_METERS, LANDMARKS,\n` +
`    prepareCurve: prepare${config.className}Curve, finishBeforeStart: ${config.finishBeforeStart},\n` +
`    gridSpacing: ${config.gridSpacing}, gridLane: ${config.gridLane}, pitSide: ${config.pitSide},\n` +
`    groundColor: ${config.groundColor}, shoulderColor: ${config.shoulderColor},\n` +
`    curbColor: ${config.curbColor}, accent: ${config.accent}, seed: ${config.seed},\n` +
`    urban: ${config.urban},\n` +
`  });\n}\n`;
}

function gridModule(config) {
  return `// Spatial constants used by the free-race and camera controllers.\n` +
`export const ${config.upper}_FINISH_BEFORE_START_METERS = ${config.finishBeforeStart};\n` +
`export const GRID_SLOT_SPACING = ${config.gridSpacing};\n` +
`export const GRID_LANE_CENTER = ${config.gridLane};\n` +
`export const PIT_START_LANE_CENTER = ${config.pitLane};\n`;
}

function indexHtml(config, template) {
  let html = template;
  const replacements = [
    ['#061326', config.slug === 'baku' ? '#10242d' : config.slug === 'sepang' ? '#102818' : '#17243a'],
    ['Explorez en 3D le Circuit of The Americas à Austin et revivez le Grand Prix des États-Unis 2025.', `Explorez en 3D ${config.officialName} avec son tracé et son relief OpenF1 2026.`],
    ['Austin · Circuit of The Americas 3D & replay 2025', `${config.display} · circuit 3D 2026`],
    ['Reconstitution interactive en 3D du Circuit of The Americas à Austin', `Reconstitution interactive en 3D de ${config.officialName}`],
    ['<span class="brand-mark" aria-hidden="true">A</span>', `<span class="brand-mark" aria-hidden="true">${config.upper[0]}</span>`],
    ['<p class="eyebrow">CIRCUIT OF THE AMERICAS</p>', `<p class="eyebrow">${config.officialName.toUpperCase()}</p>`],
    ['<h1>AUSTIN <span>/ 3D</span></h1>', `<h1>${config.upper} <span>/ 3D</span></h1>`],
    ['<strong class="circuit-menu__current">Austin</strong>', `<strong class="circuit-menu__current">${config.display}</strong>`],
    ['AUSTIN · COTA', `${config.upper} · 2026`],
    ['<strong>5,513</strong><span>KM DE PISTE</span>', `<strong>${config.lengthText}</strong><span>KM DE PISTE</span>`],
    ['<strong>20</strong><span>VIRAGES</span>', `<strong>${config.turns}</strong><span>VIRAGES</span>`],
    ['Piste permanente · montée vers le virage 1', config.note],
    ['AUSTIN / GP', `${config.upper} / GP`],
    ['0,00 / 5,51 KM', `0,00 / ${(config.length / 1000).toFixed(2).replace('.', ',')} KM`],
    ['Replay du Grand Prix des États-Unis 2025', `Replay de ${config.event}`],
    ['REPLAY · GP 2025', 'REPLAY · GP 2026'],
    ['Course 2025 · monoplaces 2026 du garage. Isack Hadjar figure au classement sans modèle 3D.', `Course 2026 · les 22 monoplaces du garage sont présentes.`],
    ['Classement officiel du Grand Prix des États-Unis 2025', `Classement officiel de ${config.event}`],
    ['AUSTIN · CIRCUIT 3D', `${config.upper} · CIRCUIT 3D`],
    ['EXPLORER AUSTIN <span>03 / CIRCUIT</span>', `EXPLORER ${config.upper} <span>2026 / CIRCUIT</span>`],
    ['Circuit of The Americas. Replay GP 2025 : 19 des 20 pilotes représentés avec les modèles 2026 du garage.', `${config.officialName}. Simulation libre avec les 22 monoplaces 2026.`],
    ['title="Revoir le Grand Prix des États-Unis 2025 avec les données de course">Replay GP 2025</button>', `title="Le replay détaillé sera ajouté séparément" hidden>Replay GP 2026</button>`],
  ];
  for (const [from, to] of replacements) html = html.replaceAll(from, to);
  html = html.replace('<a href="../austin/" aria-current="page">', '<a href="../austin/">');
  return html;
}

for (const config of circuits) {
  const folder = path.join(ROOT, 'dist', config.slug);
  await mkdir(path.join(folder, 'data'), { recursive: true });
  for (const filename of ['styles.css', 'race-motion.js', 'free-race-field.js',
    'free-speed-profile.js', 'entity-spacing.js']) {
    await writeFile(path.join(folder, filename), await readFile(path.join(AUSTIN, filename)));
  }
  const archive = JSON.parse(await readFile(path.join(import.meta.dirname, 'cache',
    `${config.slug}-race.json`), 'utf8'));
  await writeFile(path.join(folder, 'replay-roster.js'), rosterModule(config, archive));
  await writeFile(path.join(folder, 'world.js'), worldModule(config));
  await writeFile(path.join(folder, 'grid-details.js'), gridModule(config));

  let lanes = await readFile(path.join(AUSTIN, 'replay-lanes.js'), 'utf8');
  lanes = lanes.replaceAll('AUSTIN_FINISH_BEFORE_START_METERS',
    `${config.upper}_FINISH_BEFORE_START_METERS`).replaceAll('5513', String(config.length));
  await writeFile(path.join(folder, 'replay-lanes.js'), lanes);

  let sky = await readFile(path.join(AUSTIN, 'sky.js'), 'utf8');
  sky = sky.replaceAll('Austin', config.display).replaceAll('COTA', config.upper)
    .replaceAll('4812', String(config.seed % 100000))
    .replace('new THREE.SphereGeometry(6000, 32, 18)',
      'new THREE.SphereGeometry(18000, 32, 18)');
  await writeFile(path.join(folder, 'sky.js'), sky);

  let weather = await readFile(path.join(AUSTIN, 'weather.js'), 'utf8');
  weather = weather.replaceAll('Austin', config.display).replaceAll('5513', String(config.length))
    .replaceAll('260906', String(config.seed % 1000000));
  await writeFile(path.join(folder, 'weather.js'), weather);

  let main = await readFile(path.join(AUSTIN, 'main.js'), 'utf8');
  const prefix = `${config.upper}_2026`;
  main = main.replaceAll('Austin', config.className).replaceAll('AUSTIN_2025', prefix)
    .replaceAll('austin-2025-replay.json', `${config.slug}-2026-replay.json`)
    .replaceAll("let replayTotalLaps = 56;", `let replayTotalLaps = ${config.laps};`)
    .replaceAll("Replay GP 2025", 'Replay GP 2026')
    .replace('new THREE.Fog(0xc4c9b8, 2800, 8000)',
      'new THREE.Fog(0xc4c9b8, 5200, 20000)')
    .replace('new THREE.PerspectiveCamera(41, 1, 0.5, 6500)',
      'new THREE.PerspectiveCamera(41, 1, 0.5, 24000)')
    .replace('renderer.shadowMap.enabled = true;', 'renderer.shadowMap.enabled = false;')
    .replace('controls.maxDistance = 5200;', 'controls.maxDistance = 16000;')
    .replace('span * 2.95', 'span * 2.45')
    .replace('span * 2.34', 'span * 1.82')
    .replace('gridU: world.gridU, trackLengthMeters: trackGap.lengthMeters,',
      `gridU: world.gridU, trackLengthMeters: ${config.length},`)
    .replace('if (replayButton) replayButton.disabled = !allCarsLoaded;',
      'if (replayButton) replayButton.disabled = true;')
    .replace("loadingMessage.textContent = 'Le circuit n’a pas pu être affiché.';",
      "loadingMessage.textContent = `Le circuit n’a pas pu être affiché : ${error.message}`;");
  await writeFile(path.join(folder, 'main.js'), main);

  const template = await readFile(path.join(AUSTIN, 'index.html'), 'utf8');
  await writeFile(path.join(folder, 'index.html'), indexHtml(config, template));
  console.log(`${config.slug}: viewer scaffolded`);
}
