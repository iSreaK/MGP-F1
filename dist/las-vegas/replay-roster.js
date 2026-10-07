// Las Vegas 2025: official starting grid and final classification.
// https://www.formula1.com/en/results/2025/races/1274/las-vegas/starting-grid
// https://www.formula1.com/en/results/2025/races/1274/las-vegas/race-result
// Tsunoda started from the pit lane; Norris/Piastri were disqualified after
// finishing and remain part of the moving replay through the final lap.
export const VEGAS_2025_ROSTER = Object.freeze([
  { replayNumber: 4, name: 'Lando Norris', gridPosition: 1, finalPosition: 19, classification: 'DSQ', team2025: 'McLaren', modelKey: 'mclaren', completedLaps: 50 },
  { replayNumber: 1, name: 'Max Verstappen', gridPosition: 2, finalPosition: 1, team2025: 'Red Bull Racing', modelKey: 'redbull', completedLaps: 50 },
  { replayNumber: 55, name: 'Carlos Sainz', gridPosition: 3, finalPosition: 5, team2025: 'Williams', modelKey: 'williams-sainz', completedLaps: 50 },
  { replayNumber: 63, name: 'George Russell', gridPosition: 4, finalPosition: 2, team2025: 'Mercedes', modelKey: 'mercedes-russell', completedLaps: 50 },
  { replayNumber: 81, name: 'Oscar Piastri', gridPosition: 5, finalPosition: 20, classification: 'DSQ', team2025: 'McLaren', modelKey: 'mclaren-piastri', completedLaps: 50 },
  { replayNumber: 30, name: 'Liam Lawson', gridPosition: 6, finalPosition: 14, team2025: 'Racing Bulls', modelKey: 'redbull-lawson', completedLaps: 49 },
  { replayNumber: 14, name: 'Fernando Alonso', gridPosition: 7, finalPosition: 11, team2025: 'Aston Martin', modelKey: 'astonmartin-alonso', completedLaps: 50 },
  { replayNumber: 6, name: 'Isack Hadjar', gridPosition: 8, finalPosition: 6, team2025: 'Racing Bulls', modelKey: null, completedLaps: 50 },
  { replayNumber: 16, name: 'Charles Leclerc', gridPosition: 9, finalPosition: 4, team2025: 'Ferrari', modelKey: 'ferrari-leclerc', completedLaps: 50 },
  { replayNumber: 10, name: 'Pierre Gasly', gridPosition: 10, finalPosition: 13, team2025: 'Alpine', modelKey: 'alpine', completedLaps: 50 },
  { replayNumber: 27, name: 'Nico Hülkenberg', gridPosition: 11, finalPosition: 7, team2025: 'Kick Sauber', modelKey: 'audi-hulkenberg', completedLaps: 50 },
  { replayNumber: 18, name: 'Lance Stroll', gridPosition: 12, finalPosition: 18, classification: 'NC', team2025: 'Aston Martin', modelKey: 'astonmartin-stroll', completedLaps: 0, status: 'retired' },
  { replayNumber: 31, name: 'Esteban Ocon', gridPosition: 13, finalPosition: 9, team2025: 'Haas', modelKey: 'haas-ocon', completedLaps: 50 },
  { replayNumber: 87, name: 'Oliver Bearman', gridPosition: 14, finalPosition: 10, team2025: 'Haas', modelKey: 'haas-bearman', completedLaps: 50 },
  { replayNumber: 43, name: 'Franco Colapinto', gridPosition: 15, finalPosition: 15, team2025: 'Alpine', modelKey: 'alpine-colapinto', completedLaps: 49 },
  { replayNumber: 23, name: 'Alex Albon', gridPosition: 16, finalPosition: 16, classification: 'NC', team2025: 'Williams', modelKey: 'williams-albon', completedLaps: 35, status: 'retired' },
  { replayNumber: 12, name: 'Kimi Antonelli', gridPosition: 17, finalPosition: 3, team2025: 'Mercedes', modelKey: 'mercedes', completedLaps: 50 },
  { replayNumber: 5, name: 'Gabriel Bortoleto', gridPosition: 18, finalPosition: 17, classification: 'NC', team2025: 'Kick Sauber', modelKey: 'audi', completedLaps: 2, status: 'retired' },
  { replayNumber: 44, name: 'Lewis Hamilton', gridPosition: 19, finalPosition: 8, team2025: 'Ferrari', modelKey: 'ferrari', completedLaps: 50 },
  { replayNumber: 22, name: 'Yuki Tsunoda', gridPosition: 20, finalPosition: 12, team2025: 'Red Bull Racing', modelKey: 'racingbulls-tsunoda', completedLaps: 50, pitLaneStart: true, pitStartProgressMeters: 180 },
]);

export const VEGAS_2025_BY_NUMBER = Object.freeze(
  Object.fromEntries(VEGAS_2025_ROSTER.map(driver => [driver.replayNumber, driver])),
);
export const VEGAS_2025_DISPLAYED = Object.freeze(VEGAS_2025_ROSTER.filter(driver => driver.modelKey));
export const VEGAS_2025_TRACK_LENGTH_METERS = 6201;
export const VEGAS_2025_CONTROL_LINE_OFFSET_METERS = 92;
