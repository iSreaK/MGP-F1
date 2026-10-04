// The 2025 Singapore race field, in the official starting order. A modelKey
// identifies an available 2026 garage model; it is deliberately separate from
// the driver's 2025 race number. Hadjar remains in the official field but has
// no local model to render.
// Grid: https://www.formula1.com/en/results/2025/races/1270/singapore/starting-grid
// Result: https://www.formula1.com/en/results/2025/races/1270/singapore/race-result
export const SINGAPORE_2025_ROSTER = Object.freeze([
  { replayNumber: 63, name: 'George Russell', gridPosition: 1, finalPosition: 1, team2025: 'Mercedes', modelKey: 'mercedes-russell' },
  { replayNumber: 1, name: 'Max Verstappen', gridPosition: 2, finalPosition: 2, team2025: 'Red Bull Racing', modelKey: 'redbull' },
  { replayNumber: 81, name: 'Oscar Piastri', gridPosition: 3, finalPosition: 4, team2025: 'McLaren', modelKey: 'mclaren-piastri' },
  { replayNumber: 12, name: 'Kimi Antonelli', gridPosition: 4, finalPosition: 5, team2025: 'Mercedes', modelKey: 'mercedes' },
  { replayNumber: 4, name: 'Lando Norris', gridPosition: 5, finalPosition: 3, team2025: 'McLaren', modelKey: 'mclaren' },
  { replayNumber: 44, name: 'Lewis Hamilton', gridPosition: 6, finalPosition: 8, team2025: 'Ferrari', modelKey: 'ferrari' },
  { replayNumber: 16, name: 'Charles Leclerc', gridPosition: 7, finalPosition: 6, team2025: 'Ferrari', modelKey: 'ferrari-leclerc' },
  { replayNumber: 6, name: 'Isack Hadjar', gridPosition: 8, finalPosition: 11, team2025: 'Racing Bulls', modelKey: null },
  { replayNumber: 87, name: 'Oliver Bearman', gridPosition: 9, finalPosition: 9, team2025: 'Haas', modelKey: 'haas-bearman' },
  { replayNumber: 14, name: 'Fernando Alonso', gridPosition: 10, finalPosition: 7, team2025: 'Aston Martin', modelKey: 'astonmartin-alonso' },
  { replayNumber: 27, name: 'Nico Hülkenberg', gridPosition: 11, finalPosition: 20, team2025: 'Kick Sauber', modelKey: 'audi-hulkenberg' },
  { replayNumber: 30, name: 'Liam Lawson', gridPosition: 12, finalPosition: 15, team2025: 'Racing Bulls', modelKey: 'redbull-lawson' },
  { replayNumber: 22, name: 'Yuki Tsunoda', gridPosition: 13, finalPosition: 12, team2025: 'Red Bull Racing', modelKey: 'racingbulls-tsunoda' },
  { replayNumber: 5, name: 'Gabriel Bortoleto', gridPosition: 14, finalPosition: 17, team2025: 'Kick Sauber', modelKey: 'audi' },
  { replayNumber: 18, name: 'Lance Stroll', gridPosition: 15, finalPosition: 13, team2025: 'Aston Martin', modelKey: 'astonmartin-stroll' },
  { replayNumber: 43, name: 'Franco Colapinto', gridPosition: 16, finalPosition: 16, team2025: 'Alpine', modelKey: 'alpine-colapinto' },
  { replayNumber: 31, name: 'Esteban Ocon', gridPosition: 17, finalPosition: 18, team2025: 'Haas', modelKey: 'haas-ocon' },
  { replayNumber: 55, name: 'Carlos Sainz', gridPosition: 18, finalPosition: 10, team2025: 'Williams', modelKey: 'williams-sainz' },
  // The pit-start stations come from the processed OpenF1 pre-start XY
  // positions, measured forward from the standing-start line.
  { replayNumber: 10, name: 'Pierre Gasly', gridPosition: 19, finalPosition: 19, team2025: 'Alpine', modelKey: 'alpine', pitLaneStart: true, pitStartProgressMeters: 141.28 },
  { replayNumber: 23, name: 'Alex Albon', gridPosition: 20, finalPosition: 14, team2025: 'Williams', modelKey: 'williams-albon', pitLaneStart: true, pitStartProgressMeters: 108.88 },
]);

export const SINGAPORE_2025_BY_NUMBER = Object.freeze(
  Object.fromEntries(SINGAPORE_2025_ROSTER.map(driver => [driver.replayNumber, driver])),
);
export const SINGAPORE_2025_DISPLAYED = Object.freeze(
  SINGAPORE_2025_ROSTER.filter(driver => driver.modelKey),
);
// FIA 2025 circuit map: 4.927 km. The public F1 timetable still states
// 4.940 km, but the FIA race distance (305.337 km after 62 laps) corroborates
// 4.927 km with the 137 m start/control line separation.
export const SINGAPORE_2025_TRACK_LENGTH_METERS = 4927;
