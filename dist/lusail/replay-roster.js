// 2025 Qatar GP: official F1 starting grid and race classification.
// https://www.formula1.com/en/results/2025/races/1275/qatar/starting-grid
// https://www.formula1.com/en/results/2025/races/1275/qatar/race-result
// Race numbers and identities are historical; 3D liveries remain the 2026 garage assets.
export const LUSAIL_2025_ROSTER = Object.freeze([
  { replayNumber: 81, name: 'Oscar Piastri', gridPosition: 1, finalPosition: 2, team2025: 'McLaren', modelKey: 'mclaren-piastri', completedLaps: 57 },
  { replayNumber: 4, name: 'Lando Norris', gridPosition: 2, finalPosition: 4, team2025: 'McLaren', modelKey: 'mclaren', completedLaps: 57 },
  { replayNumber: 1, name: 'Max Verstappen', gridPosition: 3, finalPosition: 1, team2025: 'Red Bull Racing', modelKey: 'redbull', completedLaps: 57 },
  { replayNumber: 63, name: 'George Russell', gridPosition: 4, finalPosition: 6, team2025: 'Mercedes', modelKey: 'mercedes-russell', completedLaps: 57 },
  { replayNumber: 12, name: 'Kimi Antonelli', gridPosition: 5, finalPosition: 5, team2025: 'Mercedes', modelKey: 'mercedes', completedLaps: 57 },
  { replayNumber: 6, name: 'Isack Hadjar', gridPosition: 6, finalPosition: 18, team2025: 'Racing Bulls', modelKey: null, completedLaps: 55, status: 'retired' },
  { replayNumber: 55, name: 'Carlos Sainz', gridPosition: 7, finalPosition: 3, team2025: 'Williams', modelKey: 'williams-sainz', completedLaps: 57 },
  { replayNumber: 14, name: 'Fernando Alonso', gridPosition: 8, finalPosition: 7, team2025: 'Aston Martin', modelKey: 'astonmartin-alonso', completedLaps: 57 },
  { replayNumber: 10, name: 'Pierre Gasly', gridPosition: 9, finalPosition: 16, team2025: 'Alpine', modelKey: 'alpine', completedLaps: 56 },
  { replayNumber: 16, name: 'Charles Leclerc', gridPosition: 10, finalPosition: 8, team2025: 'Ferrari', modelKey: 'ferrari-leclerc', completedLaps: 57 },
  { replayNumber: 27, name: 'Nico Hülkenberg', gridPosition: 11, finalPosition: 20, classification: 'NC', team2025: 'Kick Sauber', modelKey: 'audi-hulkenberg', completedLaps: 6, status: 'retired' },
  { replayNumber: 30, name: 'Liam Lawson', gridPosition: 12, finalPosition: 9, team2025: 'Racing Bulls', modelKey: 'redbull-lawson', completedLaps: 57 },
  { replayNumber: 87, name: 'Oliver Bearman', gridPosition: 13, finalPosition: 19, classification: 'NC', team2025: 'Haas', modelKey: 'haas-bearman', completedLaps: 41, status: 'retired' },
  { replayNumber: 23, name: 'Alex Albon', gridPosition: 14, finalPosition: 11, team2025: 'Williams', modelKey: 'williams-albon', completedLaps: 57 },
  { replayNumber: 22, name: 'Yuki Tsunoda', gridPosition: 15, finalPosition: 10, team2025: 'Red Bull Racing', modelKey: 'racingbulls-tsunoda', completedLaps: 57 },
  { replayNumber: 31, name: 'Esteban Ocon', gridPosition: 16, finalPosition: 15, team2025: 'Haas', modelKey: 'haas-ocon', completedLaps: 56 },
  { replayNumber: 44, name: 'Lewis Hamilton', gridPosition: 17, finalPosition: 12, team2025: 'Ferrari', modelKey: 'ferrari', completedLaps: 57 },
  { replayNumber: 18, name: 'Lance Stroll', gridPosition: 18, finalPosition: 17, team2025: 'Aston Martin', modelKey: 'astonmartin-stroll', completedLaps: 55, status: 'retired' },
  { replayNumber: 5, name: 'Gabriel Bortoleto', gridPosition: 19, finalPosition: 13, team2025: 'Kick Sauber', modelKey: 'audi', completedLaps: 57 },
  { replayNumber: 43, name: 'Franco Colapinto', gridPosition: 20, finalPosition: 14, team2025: 'Alpine', modelKey: 'alpine-colapinto', completedLaps: 56 },
]);

export const LUSAIL_2025_BY_NUMBER = Object.freeze(Object.fromEntries(LUSAIL_2025_ROSTER.map(driver => [driver.replayNumber, driver])));
export const LUSAIL_2025_DISPLAYED = Object.freeze(LUSAIL_2025_ROSTER.filter(driver => driver.modelKey));
export function lusailReplayRankLabel(number, position, classificationFinal) {
  return classificationFinal && LUSAIL_2025_BY_NUMBER[number]?.classification === 'NC'
    ? 'NC' : `P${position ?? '—'}`;
}
export const LUSAIL_2025_TRACK_LENGTH_METERS = 5419;
// 57 × 5,419 m − 308,611 m official race distance = 272 m between control and start lines.
export const LUSAIL_2025_CONTROL_LINE_OFFSET_METERS = 272;
