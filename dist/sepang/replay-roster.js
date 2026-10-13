// Grille d'affichage fondée sur la classification OpenF1 de Grand Prix de Bahreïn en Malaisie 2026.
// Le replay historique détaillé n'est pas embarqué dans cette première version.
export const SEPANG_2026_ROSTER = Object.freeze([
  { replayNumber: 3, name: "Max Verstappen", gridPosition: 1, finalPosition: 1, team2026: "Red Bull Racing", modelKey: "redbull", completedLaps: 55 },
  { replayNumber: 12, name: "Kimi Antonelli", gridPosition: 2, finalPosition: 2, team2026: "Mercedes", modelKey: "mercedes", completedLaps: 55 },
  { replayNumber: 44, name: "Lewis Hamilton", gridPosition: 3, finalPosition: 3, team2026: "Ferrari", modelKey: "ferrari", completedLaps: 55 },
  { replayNumber: 16, name: "Charles Leclerc", gridPosition: 4, finalPosition: 4, team2026: "Ferrari", modelKey: "ferrari-leclerc", completedLaps: 55 },
  { replayNumber: 81, name: "Oscar Piastri", gridPosition: 5, finalPosition: 5, team2026: "McLaren", modelKey: "mclaren-piastri", completedLaps: 55 },
  { replayNumber: 30, name: "Liam Lawson", gridPosition: 6, finalPosition: 6, team2026: "Racing Bulls", modelKey: "redbull-lawson", completedLaps: 55 },
  { replayNumber: 14, name: "Fernando Alonso", gridPosition: 7, finalPosition: 7, team2026: "Aston Martin", modelKey: "astonmartin-alonso", completedLaps: 55 },
  { replayNumber: 1, name: "Lando Norris", gridPosition: 8, finalPosition: 8, team2026: "McLaren", modelKey: "mclaren", completedLaps: 55 },
  { replayNumber: 41, name: "Arvid Lindblad", gridPosition: 9, finalPosition: 9, team2026: "Racing Bulls", modelKey: "racingbulls-lindblad", completedLaps: 55 },
  { replayNumber: 27, name: "Nico Hulkenberg", gridPosition: 10, finalPosition: 10, team2026: "Audi", modelKey: "audi-hulkenberg", completedLaps: 55 },
  { replayNumber: 18, name: "Lance Stroll", gridPosition: 11, finalPosition: 11, team2026: "Aston Martin", modelKey: "astonmartin-stroll", completedLaps: 55 },
  { replayNumber: 43, name: "Franco Colapinto", gridPosition: 12, finalPosition: 12, team2026: "Alpine", modelKey: "alpine-colapinto", completedLaps: 55 },
  { replayNumber: 87, name: "Oliver Bearman", gridPosition: 13, finalPosition: 13, team2026: "Haas F1 Team", modelKey: "haas-bearman", completedLaps: 55 },
  { replayNumber: 31, name: "Esteban Ocon", gridPosition: 14, finalPosition: 14, team2026: "Haas F1 Team", modelKey: "haas-ocon", completedLaps: 55 },
  { replayNumber: 10, name: "Pierre Gasly", gridPosition: 15, finalPosition: 15, team2026: "Alpine", modelKey: "alpine", completedLaps: 55 },
  { replayNumber: 55, name: "Carlos Sainz", gridPosition: 16, finalPosition: 16, team2026: "Williams", modelKey: "williams-sainz", completedLaps: 55 },
  { replayNumber: 5, name: "Gabriel Bortoleto", gridPosition: 17, finalPosition: 17, team2026: "Audi", modelKey: "audi", completedLaps: 55 },
  { replayNumber: 11, name: "Sergio Perez", gridPosition: 18, finalPosition: 18, team2026: "Cadillac", modelKey: "cadillac-perez", completedLaps: 55 },
  { replayNumber: 63, name: "George Russell", gridPosition: 19, finalPosition: 19, team2026: "Mercedes", modelKey: "mercedes-russell", completedLaps: 49, status: 'retired' },
  { replayNumber: 23, name: "Alexander Albon", gridPosition: 20, finalPosition: 20, team2026: "Williams", modelKey: "williams-albon", completedLaps: 41, status: 'retired' },
  { replayNumber: 77, name: "Valtteri Bottas", gridPosition: 21, finalPosition: 21, team2026: "Cadillac", modelKey: "cadillac-bottas", completedLaps: 7, status: 'retired' },
  { replayNumber: 22, name: "Yuki Tsunoda", gridPosition: 22, finalPosition: 22, team2026: "Racing Bulls", modelKey: "racingbulls-tsunoda", completedLaps: 0 },
]);

export const SEPANG_2026_BY_NUMBER = Object.freeze(Object.fromEntries(
  SEPANG_2026_ROSTER.map(driver => [driver.replayNumber, driver]),
));
export const SEPANG_2026_DISPLAYED = Object.freeze(SEPANG_2026_ROSTER.filter(driver => driver.modelKey));
export const SEPANG_2026_TRACK_LENGTH_METERS = 5543;
export const SEPANG_2026_CONTROL_LINE_OFFSET_METERS = 185;
