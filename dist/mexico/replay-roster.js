// 2025 Mexico City Grand Prix official starting grid and final result.
// Sources: https://www.formula1.com/en/results/2025/races/1272/mexico/starting-grid
//          https://www.formula1.com/en/results/2025/races/1272/mexico/race-result
// The historical race number remains separate from the garage's 2026 model.
export const MEXICO_2025_ROSTER = Object.freeze([
  { replayNumber: 4, name: 'Lando Norris', gridPosition: 1, finalPosition: 1, team2025: 'McLaren', modelKey: 'mclaren', completedLaps: 71 },
  { replayNumber: 16, name: 'Charles Leclerc', gridPosition: 2, finalPosition: 2, team2025: 'Ferrari', modelKey: 'ferrari-leclerc', completedLaps: 71 },
  { replayNumber: 44, name: 'Lewis Hamilton', gridPosition: 3, finalPosition: 8, team2025: 'Ferrari', modelKey: 'ferrari', completedLaps: 71 },
  { replayNumber: 63, name: 'George Russell', gridPosition: 4, finalPosition: 7, team2025: 'Mercedes', modelKey: 'mercedes-russell', completedLaps: 71 },
  { replayNumber: 1, name: 'Max Verstappen', gridPosition: 5, finalPosition: 3, team2025: 'Red Bull Racing', modelKey: 'redbull', completedLaps: 71 },
  { replayNumber: 12, name: 'Kimi Antonelli', gridPosition: 6, finalPosition: 6, team2025: 'Mercedes', modelKey: 'mercedes', completedLaps: 71 },
  { replayNumber: 81, name: 'Oscar Piastri', gridPosition: 7, finalPosition: 5, team2025: 'McLaren', modelKey: 'mclaren-piastri', completedLaps: 71 },
  { replayNumber: 6, name: 'Isack Hadjar', gridPosition: 8, finalPosition: 13, team2025: 'Racing Bulls', modelKey: null, completedLaps: 70 },
  { replayNumber: 87, name: 'Oliver Bearman', gridPosition: 9, finalPosition: 4, team2025: 'Haas', modelKey: 'haas-bearman', completedLaps: 71 },
  { replayNumber: 22, name: 'Yuki Tsunoda', gridPosition: 10, finalPosition: 11, team2025: 'Red Bull Racing', modelKey: 'racingbulls-tsunoda', completedLaps: 71 },
  { replayNumber: 31, name: 'Esteban Ocon', gridPosition: 11, finalPosition: 9, team2025: 'Haas', modelKey: 'haas-ocon', completedLaps: 71 },
  { replayNumber: 55, name: 'Carlos Sainz', gridPosition: 12, finalPosition: 17, team2025: 'Williams', modelKey: 'williams-sainz', completedLaps: 67, status: 'retired' },
  { replayNumber: 27, name: 'Nico Hülkenberg', gridPosition: 13, finalPosition: 19, team2025: 'Kick Sauber', modelKey: 'audi-hulkenberg', completedLaps: 25, status: 'retired' },
  { replayNumber: 14, name: 'Fernando Alonso', gridPosition: 14, finalPosition: 18, team2025: 'Aston Martin', modelKey: 'astonmartin-alonso', completedLaps: 34, status: 'retired' },
  { replayNumber: 30, name: 'Liam Lawson', gridPosition: 15, finalPosition: 20, team2025: 'Racing Bulls', modelKey: 'redbull-lawson', completedLaps: 5, status: 'retired' },
  { replayNumber: 5, name: 'Gabriel Bortoleto', gridPosition: 16, finalPosition: 10, team2025: 'Kick Sauber', modelKey: 'audi', completedLaps: 71 },
  { replayNumber: 23, name: 'Alex Albon', gridPosition: 17, finalPosition: 12, team2025: 'Williams', modelKey: 'williams-albon', completedLaps: 70 },
  { replayNumber: 10, name: 'Pierre Gasly', gridPosition: 18, finalPosition: 15, team2025: 'Alpine', modelKey: 'alpine', completedLaps: 70 },
  { replayNumber: 18, name: 'Lance Stroll', gridPosition: 19, finalPosition: 14, team2025: 'Aston Martin', modelKey: 'astonmartin-stroll', completedLaps: 70 },
  { replayNumber: 43, name: 'Franco Colapinto', gridPosition: 20, finalPosition: 16, team2025: 'Alpine', modelKey: 'alpine-colapinto', completedLaps: 70 },
]);

export const MEXICO_2025_BY_NUMBER = Object.freeze(
  Object.fromEntries(MEXICO_2025_ROSTER.map(driver => [driver.replayNumber, driver])),
);
export const MEXICO_2025_DISPLAYED = Object.freeze(MEXICO_2025_ROSTER.filter(driver => driver.modelKey));
export const MEXICO_2025_TRACK_LENGTH_METERS = 4304;
// 71 × 4,304 m - 305,354 m official race distance = 230 m.
export const MEXICO_2025_CONTROL_LINE_OFFSET_METERS = 230;
