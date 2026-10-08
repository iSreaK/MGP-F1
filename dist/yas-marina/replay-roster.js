// 2025 Abu Dhabi GP: official F1 starting grid and race classification.
// https://www.formula1.com/en/results/2025/races/1276/abu-dhabi/starting-grid
// https://www.formula1.com/en/results/2025/races/1276/abu-dhabi/race-result
// The 2025 identities are paired with the available 2026 garage models.
export const YAS_MARINA_2025_ROSTER = Object.freeze([
  { replayNumber: 1, name: 'Max Verstappen', gridPosition: 1, finalPosition: 1, team2025: 'Red Bull Racing', modelKey: 'redbull', completedLaps: 58 },
  { replayNumber: 4, name: 'Lando Norris', gridPosition: 2, finalPosition: 3, team2025: 'McLaren', modelKey: 'mclaren', completedLaps: 58 },
  { replayNumber: 81, name: 'Oscar Piastri', gridPosition: 3, finalPosition: 2, team2025: 'McLaren', modelKey: 'mclaren-piastri', completedLaps: 58 },
  { replayNumber: 63, name: 'George Russell', gridPosition: 4, finalPosition: 5, team2025: 'Mercedes', modelKey: 'mercedes-russell', completedLaps: 58 },
  { replayNumber: 16, name: 'Charles Leclerc', gridPosition: 5, finalPosition: 4, team2025: 'Ferrari', modelKey: 'ferrari-leclerc', completedLaps: 58 },
  { replayNumber: 14, name: 'Fernando Alonso', gridPosition: 6, finalPosition: 6, team2025: 'Aston Martin', modelKey: 'astonmartin-alonso', completedLaps: 58 },
  { replayNumber: 5, name: 'Gabriel Bortoleto', gridPosition: 7, finalPosition: 11, team2025: 'Kick Sauber', modelKey: 'audi', completedLaps: 58 },
  { replayNumber: 31, name: 'Esteban Ocon', gridPosition: 8, finalPosition: 7, team2025: 'Haas F1 Team', modelKey: 'haas-ocon', completedLaps: 58 },
  { replayNumber: 6, name: 'Isack Hadjar', gridPosition: 9, finalPosition: 17, team2025: 'Racing Bulls', modelKey: null, completedLaps: 57 },
  { replayNumber: 22, name: 'Yuki Tsunoda', gridPosition: 10, finalPosition: 14, team2025: 'Red Bull Racing', modelKey: 'racingbulls-tsunoda', completedLaps: 58 },
  { replayNumber: 87, name: 'Oliver Bearman', gridPosition: 11, finalPosition: 12, team2025: 'Haas F1 Team', modelKey: 'haas-bearman', completedLaps: 58 },
  { replayNumber: 55, name: 'Carlos Sainz', gridPosition: 12, finalPosition: 13, team2025: 'Williams', modelKey: 'williams-sainz', completedLaps: 58 },
  { replayNumber: 30, name: 'Liam Lawson', gridPosition: 13, finalPosition: 18, team2025: 'Racing Bulls', modelKey: 'redbull-lawson', completedLaps: 57 },
  { replayNumber: 12, name: 'Kimi Antonelli', gridPosition: 14, finalPosition: 15, team2025: 'Mercedes', modelKey: 'mercedes', completedLaps: 58 },
  { replayNumber: 18, name: 'Lance Stroll', gridPosition: 15, finalPosition: 10, team2025: 'Aston Martin', modelKey: 'astonmartin-stroll', completedLaps: 58 },
  { replayNumber: 44, name: 'Lewis Hamilton', gridPosition: 16, finalPosition: 8, team2025: 'Ferrari', modelKey: 'ferrari', completedLaps: 58 },
  { replayNumber: 23, name: 'Alex Albon', gridPosition: 17, finalPosition: 16, team2025: 'Williams', modelKey: 'williams-albon', completedLaps: 58 },
  { replayNumber: 27, name: 'Nico Hülkenberg', gridPosition: 18, finalPosition: 9, team2025: 'Kick Sauber', modelKey: 'audi-hulkenberg', completedLaps: 58 },
  { replayNumber: 10, name: 'Pierre Gasly', gridPosition: 19, finalPosition: 19, team2025: 'Alpine', modelKey: 'alpine', completedLaps: 57 },
  { replayNumber: 43, name: 'Franco Colapinto', gridPosition: 20, finalPosition: 20, team2025: 'Alpine', modelKey: 'alpine-colapinto', completedLaps: 57 },
]);
export const YAS_MARINA_2025_BY_NUMBER = Object.freeze(Object.fromEntries(YAS_MARINA_2025_ROSTER.map(driver => [driver.replayNumber, driver])));
export const YAS_MARINA_2025_DISPLAYED = Object.freeze(YAS_MARINA_2025_ROSTER.filter(driver => driver.modelKey));
export function yasMarinaReplayRankLabel(number, position, classificationFinal) {
  return classificationFinal && YAS_MARINA_2025_BY_NUMBER[number]?.classification === 'NC'
    ? 'NC' : `P${position ?? '—'}`;
}
export const YAS_MARINA_2025_TRACK_LENGTH_METERS = 5281;
// 58 × 5,281 m − 306,183 m official race distance = 115 m from control to start.
export const YAS_MARINA_2025_CONTROL_LINE_OFFSET_METERS = 115;
