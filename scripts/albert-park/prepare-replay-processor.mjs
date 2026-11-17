import {readFile,writeFile} from 'node:fs/promises';
let code=(await readFile(new URL('../austin-replay/process-replay.mjs',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
code=code.replaceAll('AUSTIN_2025','ALBERT_PARK_2026').replaceAll('AUSTIN_REPLAY','ALBERT_PARK_REPLAY')
 .replaceAll("'austin'","'albert-park'").replaceAll('/austin/','/albert-park/')
 .replaceAll('austin-2025-replay','albert-park-2026-replay').replaceAll('Austin','Melbourne')
 .replaceAll("'United States'","'Australia'").replaceAll('États-Unis','Australie')
 .replaceAll('2025','2026').replaceAll('1271/usa','1279/australia')
 .replaceAll('team2025','team2026');
code=code.replace('ALBERT_PARK_2026_ROSTER.map(driver => ({',
 "ALBERT_PARK_2026_ROSTER.filter(driver => driver.status !== 'dns').map(driver => ({");
code=code.replace("model.driverName.toLowerCase().includes(driver.name.split(' ').at(-1).toLowerCase())",
 "model.driverName.normalize('NFD').replace(/\\p{Diacritic}/gu,'').toLowerCase().includes(driver.name.split(' ').at(-1).normalize('NFD').replace(/\\p{Diacritic}/gu,'').toLowerCase())");
code=code.replace("2026_united_states_grand_prix_-_event_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_quarantine_zone_map_red_zones_map.pdf",
 "2026_australian_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_quarantine_zone.pdf");
code=code.replace('Le circuit mesure 5 513 m ; la distance officielle de 308 405 m sur 56 tours situe la ligne de contrôle 323 m avant le départ.',
 'Le circuit mesure 5 278 m ; la ligne de contrôle coïncide avec le départ selon le visa FIA 2026.');
code=code.replace("// Official F1: 56 * 5,513 m - race distance 308,405 m = 323 m.",
 '// FIA 2026 competition visa: start/control offset 0 m.');
code=code.replace('20 historical entrants','20 historical starters (22 entrants including two DNS)');
let lateral=await readFile(new URL('../austin-replay/gps-lateral.mjs',import.meta.url),'utf8');
lateral=lateral.replace('index += 4','index += 2');
await writeFile(new URL('./gps-lateral.mjs',import.meta.url),lateral);
// Require exact race session metadata. The two DNS drivers have no invented
// timing samples and remain in officialField only.
code=code.replace('fieldCount: 20, renderedModelCount: 19,',
 'fieldCount: 20, entrantCount: 22, renderedModelCount: 19, nonStarters: [81,27],');
code=code.replace(`const gpsLateral = reconstructGpsLateral(prepared, frameTimes, TRACK_POINTS,
    TRACK_LENGTH_METERS, CONTROL_LINE_OFFSET_METERS, pit);`,
`let gpsLateral;
  try { gpsLateral = reconstructGpsLateral(prepared, frameTimes, TRACK_POINTS,
    TRACK_LENGTH_METERS, CONTROL_LINE_OFFSET_METERS, pit); }
  catch (error) {
    if (!/OpenF1 XY/.test(error.message)) throw error;
    // Keep the lap timing and measured speed. Reject weak absolute XY
    // registration rather than presenting low-quality lateral GPS as exact.
    gpsLateral = { byNumber: new Map(prepared.map(driver => [driver.number,
      frameTimes.map(() => [0,0])])), quality: { available: false,
      reason: error.message, phaseMetres: 0, registrationRmsMetres: null,
      confidentFrames: 0, totalFrames: prepared.length * frameTimes.length } };
    result.session.reconstruction.progress = "Vitesses OpenF1 intégrées et recalées à chaque passage de ligne. Circuit de 5 278 m, départ et contrôle confondus selon le visa FIA 2026. Le calage XY a échoué au seuil de qualité : les trajectoires latérales restent indicatives.";
    result.session.reconstruction.lateral = 'Calage XY insuffisant : trajectoire latérale indicative, aucun écart GPS affiché comme mesuré.';
  }`);
await writeFile(new URL('./process-replay.mjs',import.meta.url),code);
console.log('Albert Park replay processor generated from the validated timing pipeline.');
