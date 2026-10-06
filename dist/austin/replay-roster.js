// 2025 United States Grand Prix starting grid and final classification.
// Sources: https://www.formula1.com/en/results/2025/races/1271/usa/starting-grid
//          https://www.formula1.com/en/results/2025/races/1271/usa/race-result
// 2025 race numbers are separate from the 2026 garage asset numbers.
export const AUSTIN_2025_ROSTER = Object.freeze([
  { replayNumber: 1, name: 'Max Verstappen', gridPosition: 1, finalPosition: 1, team2025: 'Red Bull Racing', modelKey: 'redbull', completedLaps: 56 },
  { replayNumber: 4, name: 'Lando Norris', gridPosition: 2, finalPosition: 2, team2025: 'McLaren', modelKey: 'mclaren', completedLaps: 56 },
  { replayNumber: 16, name: 'Charles Leclerc', gridPosition: 3, finalPosition: 3, team2025: 'Ferrari', modelKey: 'ferrari-leclerc', completedLaps: 56 },
  { replayNumber: 63, name: 'George Russell', gridPosition: 4, finalPosition: 6, team2025: 'Mercedes', modelKey: 'mercedes-russell', completedLaps: 56 },
  { replayNumber: 44, name: 'Lewis Hamilton', gridPosition: 5, finalPosition: 4, team2025: 'Ferrari', modelKey: 'ferrari', completedLaps: 56 },
  { replayNumber: 81, name: 'Oscar Piastri', gridPosition: 6, finalPosition: 5, team2025: 'McLaren', modelKey: 'mclaren-piastri', completedLaps: 56 },
  { replayNumber: 12, name: 'Kimi Antonelli', gridPosition: 7, finalPosition: 13, team2025: 'Mercedes', modelKey: 'mercedes', completedLaps: 56 },
  { replayNumber: 87, name: 'Oliver Bearman', gridPosition: 8, finalPosition: 9, team2025: 'Haas', modelKey: 'haas-bearman', completedLaps: 56 },
  { replayNumber: 55, name: 'Carlos Sainz', gridPosition: 9, finalPosition: 20, team2025: 'Williams', modelKey: 'williams-sainz', completedLaps: 5, status: 'retired' },
  { replayNumber: 14, name: 'Fernando Alonso', gridPosition: 10, finalPosition: 10, team2025: 'Aston Martin', modelKey: 'astonmartin-alonso', completedLaps: 56 },
  { replayNumber: 27, name: 'Nico Hülkenberg', gridPosition: 11, finalPosition: 8, team2025: 'Kick Sauber', modelKey: 'audi-hulkenberg', completedLaps: 56 },
  { replayNumber: 30, name: 'Liam Lawson', gridPosition: 12, finalPosition: 11, team2025: 'Racing Bulls', modelKey: 'redbull-lawson', completedLaps: 56 },
  { replayNumber: 22, name: 'Yuki Tsunoda', gridPosition: 13, finalPosition: 7, team2025: 'Red Bull Racing', modelKey: 'racingbulls-tsunoda', completedLaps: 56 },
  { replayNumber: 10, name: 'Pierre Gasly', gridPosition: 14, finalPosition: 19, team2025: 'Alpine', modelKey: 'alpine', completedLaps: 55 },
  { replayNumber: 43, name: 'Franco Colapinto', gridPosition: 15, finalPosition: 17, team2025: 'Alpine', modelKey: 'alpine-colapinto', completedLaps: 55 },
  { replayNumber: 5, name: 'Gabriel Bortoleto', gridPosition: 16, finalPosition: 18, team2025: 'Kick Sauber', modelKey: 'audi', completedLaps: 55 },
  { replayNumber: 31, name: 'Esteban Ocon', gridPosition: 17, finalPosition: 15, team2025: 'Haas', modelKey: 'haas-ocon', completedLaps: 56 },
  { replayNumber: 23, name: 'Alex Albon', gridPosition: 18, finalPosition: 14, team2025: 'Williams', modelKey: 'williams-albon', completedLaps: 56 },
  { replayNumber: 18, name: 'Lance Stroll', gridPosition: 19, finalPosition: 12, team2025: 'Aston Martin', modelKey: 'astonmartin-stroll', completedLaps: 56 },
  { replayNumber: 6, name: 'Isack Hadjar', gridPosition: 20, finalPosition: 16, team2025: 'Racing Bulls', modelKey: null, completedLaps: 56 },
]);

export const AUSTIN_2025_BY_NUMBER = Object.freeze(
  Object.fromEntries(AUSTIN_2025_ROSTER.map(driver => [driver.replayNumber, driver])),
);
export const AUSTIN_2025_DISPLAYED = Object.freeze(AUSTIN_2025_ROSTER.filter(driver => driver.modelKey));
export const AUSTIN_2025_TRACK_LENGTH_METERS = 5513;
// 56 × 5,513 m - 308,405 m official race distance = 323 m.
export const AUSTIN_2025_CONTROL_LINE_OFFSET_METERS = 323;
