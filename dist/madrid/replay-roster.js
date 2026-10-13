// Grille d'affichage fondée sur la classification OpenF1 de Grand Prix d’Espagne 2026.
// Le replay historique détaillé n'est pas embarqué dans cette première version.
export const MADRID_2026_ROSTER = Object.freeze([
  { replayNumber: 12, name: "Kimi Antonelli", gridPosition: 1, finalPosition: 1, team2026: "Mercedes", modelKey: "mercedes", completedLaps: 57 },
  { replayNumber: 3, name: "Max Verstappen", gridPosition: 2, finalPosition: 2, team2026: "Red Bull Racing", modelKey: "redbull", completedLaps: 57 },
  { replayNumber: 1, name: "Lando Norris", gridPosition: 3, finalPosition: 3, team2026: "McLaren", modelKey: "mclaren", completedLaps: 57 },
  { replayNumber: 16, name: "Charles Leclerc", gridPosition: 4, finalPosition: 4, team2026: "Ferrari", modelKey: "ferrari-leclerc", completedLaps: 57 },
  { replayNumber: 63, name: "George Russell", gridPosition: 5, finalPosition: 5, team2026: "Mercedes", modelKey: "mercedes-russell", completedLaps: 57 },
  { replayNumber: 30, name: "Liam Lawson", gridPosition: 6, finalPosition: 6, team2026: "Red Bull Racing", modelKey: "redbull-lawson", completedLaps: 57 },
  { replayNumber: 43, name: "Franco Colapinto", gridPosition: 7, finalPosition: 7, team2026: "Alpine", modelKey: "alpine-colapinto", completedLaps: 57 },
  { replayNumber: 81, name: "Oscar Piastri", gridPosition: 8, finalPosition: 8, team2026: "McLaren", modelKey: "mclaren-piastri", completedLaps: 57 },
  { replayNumber: 41, name: "Arvid Lindblad", gridPosition: 9, finalPosition: 9, team2026: "Racing Bulls", modelKey: "racingbulls-lindblad", completedLaps: 56 },
  { replayNumber: 27, name: "Nico Hulkenberg", gridPosition: 10, finalPosition: 10, team2026: "Audi", modelKey: "audi-hulkenberg", completedLaps: 56 },
  { replayNumber: 31, name: "Esteban Ocon", gridPosition: 11, finalPosition: 11, team2026: "Haas F1 Team", modelKey: "haas-ocon", completedLaps: 56 },
  { replayNumber: 10, name: "Pierre Gasly", gridPosition: 12, finalPosition: 12, team2026: "Alpine", modelKey: "alpine", completedLaps: 56 },
  { replayNumber: 5, name: "Gabriel Bortoleto", gridPosition: 13, finalPosition: 13, team2026: "Audi", modelKey: "audi", completedLaps: 56 },
  { replayNumber: 22, name: "Yuki Tsunoda", gridPosition: 14, finalPosition: 14, team2026: "Racing Bulls", modelKey: "racingbulls-tsunoda", completedLaps: 56 },
  { replayNumber: 23, name: "Alexander Albon", gridPosition: 15, finalPosition: 15, team2026: "Williams", modelKey: "williams-albon", completedLaps: 56 },
  { replayNumber: 87, name: "Oliver Bearman", gridPosition: 16, finalPosition: 16, team2026: "Haas F1 Team", modelKey: "haas-bearman", completedLaps: 56 },
  { replayNumber: 14, name: "Fernando Alonso", gridPosition: 17, finalPosition: 17, team2026: "Aston Martin", modelKey: "astonmartin-alonso", completedLaps: 55 },
  { replayNumber: 77, name: "Valtteri Bottas", gridPosition: 18, finalPosition: 18, team2026: "Cadillac", modelKey: "cadillac-bottas", completedLaps: 54 },
  { replayNumber: 55, name: "Carlos Sainz", gridPosition: 19, finalPosition: 19, team2026: "Williams", modelKey: "williams-sainz", completedLaps: 43, status: 'retired' },
  { replayNumber: 11, name: "Sergio Perez", gridPosition: 20, finalPosition: 20, team2026: "Cadillac", modelKey: "cadillac-perez", completedLaps: 31, status: 'retired' },
  { replayNumber: 18, name: "Lance Stroll", gridPosition: 21, finalPosition: 21, team2026: "Aston Martin", modelKey: "astonmartin-stroll", completedLaps: 12, status: 'retired' },
  { replayNumber: 44, name: "Lewis Hamilton", gridPosition: 22, finalPosition: 22, team2026: "Ferrari", modelKey: "ferrari", completedLaps: 6, status: 'retired' },
]);

export const MADRID_2026_BY_NUMBER = Object.freeze(Object.fromEntries(
  MADRID_2026_ROSTER.map(driver => [driver.replayNumber, driver]),
));
export const MADRID_2026_DISPLAYED = Object.freeze(MADRID_2026_ROSTER.filter(driver => driver.modelKey));
export const MADRID_2026_TRACK_LENGTH_METERS = 5414;
export const MADRID_2026_CONTROL_LINE_OFFSET_METERS = 245;
