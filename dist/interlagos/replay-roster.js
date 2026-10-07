// 2025 São Paulo GP official starting grid and final classification.
// https://www.formula1.com/en/results/2025/races/1273/brazil/starting-grid
// https://www.formula1.com/en/results/2025/races/1273/brazil/race-result
// Verstappen and Ocon started from the pit lane. The garage models wear 2026
// liveries; replay numbers here follow the 2025 event.
export const INTERLAGOS_2025_ROSTER = Object.freeze([
  { replayNumber: 4, name: 'Lando Norris', gridPosition: 1, finalPosition: 1, team2025: 'McLaren', modelKey: 'mclaren', completedLaps: 71 },
  { replayNumber: 12, name: 'Kimi Antonelli', gridPosition: 2, finalPosition: 2, team2025: 'Mercedes', modelKey: 'mercedes', completedLaps: 71 },
  { replayNumber: 16, name: 'Charles Leclerc', gridPosition: 3, finalPosition: 19, team2025: 'Ferrari', modelKey: 'ferrari-leclerc', completedLaps: 5, status: 'retired' },
  { replayNumber: 81, name: 'Oscar Piastri', gridPosition: 4, finalPosition: 5, team2025: 'McLaren', modelKey: 'mclaren-piastri', completedLaps: 71 },
  { replayNumber: 6, name: 'Isack Hadjar', gridPosition: 5, finalPosition: 8, team2025: 'Racing Bulls', modelKey: null, completedLaps: 71 },
  { replayNumber: 63, name: 'George Russell', gridPosition: 6, finalPosition: 4, team2025: 'Mercedes', modelKey: 'mercedes-russell', completedLaps: 71 },
  { replayNumber: 30, name: 'Liam Lawson', gridPosition: 7, finalPosition: 7, team2025: 'Racing Bulls', modelKey: 'redbull-lawson', completedLaps: 71 },
  { replayNumber: 87, name: 'Oliver Bearman', gridPosition: 8, finalPosition: 6, team2025: 'Haas', modelKey: 'haas-bearman', completedLaps: 71 },
  { replayNumber: 10, name: 'Pierre Gasly', gridPosition: 9, finalPosition: 10, team2025: 'Alpine', modelKey: 'alpine', completedLaps: 71 },
  { replayNumber: 27, name: 'Nico Hülkenberg', gridPosition: 10, finalPosition: 9, team2025: 'Kick Sauber', modelKey: 'audi-hulkenberg', completedLaps: 71 },
  { replayNumber: 14, name: 'Fernando Alonso', gridPosition: 11, finalPosition: 14, team2025: 'Aston Martin', modelKey: 'astonmartin-alonso', completedLaps: 71 },
  { replayNumber: 23, name: 'Alex Albon', gridPosition: 12, finalPosition: 11, team2025: 'Williams', modelKey: 'williams-albon', completedLaps: 71 },
  { replayNumber: 44, name: 'Lewis Hamilton', gridPosition: 13, finalPosition: 18, team2025: 'Ferrari', modelKey: 'ferrari', completedLaps: 37, status: 'retired' },
  { replayNumber: 18, name: 'Lance Stroll', gridPosition: 14, finalPosition: 16, team2025: 'Aston Martin', modelKey: 'astonmartin-stroll', completedLaps: 71 },
  { replayNumber: 55, name: 'Carlos Sainz', gridPosition: 15, finalPosition: 13, team2025: 'Williams', modelKey: 'williams-sainz', completedLaps: 71 },
  { replayNumber: 43, name: 'Franco Colapinto', gridPosition: 16, finalPosition: 15, team2025: 'Alpine', modelKey: 'alpine-colapinto', completedLaps: 71 },
  { replayNumber: 22, name: 'Yuki Tsunoda', gridPosition: 17, finalPosition: 17, team2025: 'Red Bull Racing', modelKey: 'racingbulls-tsunoda', completedLaps: 71 },
  { replayNumber: 5, name: 'Gabriel Bortoleto', gridPosition: 18, finalPosition: 20, team2025: 'Kick Sauber', modelKey: 'audi', completedLaps: 0, status: 'retired' },
  { replayNumber: 1, name: 'Max Verstappen', gridPosition: 19, finalPosition: 3, team2025: 'Red Bull Racing', modelKey: 'redbull', completedLaps: 71, pitLaneStart: true, pitStartProgressMeters: 155 },
  { replayNumber: 31, name: 'Esteban Ocon', gridPosition: 20, finalPosition: 12, team2025: 'Haas', modelKey: 'haas-ocon', completedLaps: 71, pitLaneStart: true, pitStartProgressMeters: 164 },
]);

export const INTERLAGOS_2025_BY_NUMBER = Object.freeze(
  Object.fromEntries(INTERLAGOS_2025_ROSTER.map(driver => [driver.replayNumber, driver])));
export const INTERLAGOS_2025_DISPLAYED = Object.freeze(INTERLAGOS_2025_ROSTER.filter(driver => driver.modelKey));
export const INTERLAGOS_2025_TRACK_LENGTH_METERS = 4309;
// 71 × 4,309 m minus 305.879 km official race distance = 60 m.
export const INTERLAGOS_2025_CONTROL_LINE_OFFSET_METERS = 60;
