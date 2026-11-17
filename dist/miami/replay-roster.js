// Official 2026 Miami grid and classification. Hadjar starts from the pits.
// https://www.formula1.com/en/results/2026/races/1284/miami/starting-grid
// https://www.formula1.com/en/results/2026/races/1284/miami/race-result
// team2025 is the legacy replay schema field; these values are the actual 2026 teams.
export const MIAMI_2026_ROSTER = Object.freeze([
  {
    "replayNumber": 12,
    "name": "Kimi Antonelli",
    "gridPosition": 1,
    "finalPosition": 1,
    "team2025": "Mercedes",
    "modelKey": "mercedes",
    "completedLaps": 57
  },
  {
    "replayNumber": 3,
    "name": "Max Verstappen",
    "gridPosition": 2,
    "finalPosition": 5,
    "team2025": "Red Bull Racing",
    "modelKey": "redbull",
    "completedLaps": 57
  },
  {
    "replayNumber": 16,
    "name": "Charles Leclerc",
    "gridPosition": 3,
    "finalPosition": 8,
    "team2025": "Ferrari",
    "modelKey": "ferrari-leclerc",
    "completedLaps": 57
  },
  {
    "replayNumber": 1,
    "name": "Lando Norris",
    "gridPosition": 4,
    "finalPosition": 2,
    "team2025": "McLaren",
    "modelKey": "mclaren",
    "completedLaps": 57
  },
  {
    "replayNumber": 63,
    "name": "George Russell",
    "gridPosition": 5,
    "finalPosition": 4,
    "team2025": "Mercedes",
    "modelKey": "mercedes-russell",
    "completedLaps": 57
  },
  {
    "replayNumber": 44,
    "name": "Lewis Hamilton",
    "gridPosition": 6,
    "finalPosition": 6,
    "team2025": "Ferrari",
    "modelKey": "ferrari",
    "completedLaps": 57
  },
  {
    "replayNumber": 81,
    "name": "Oscar Piastri",
    "gridPosition": 7,
    "finalPosition": 3,
    "team2025": "McLaren",
    "modelKey": "mclaren-piastri",
    "completedLaps": 57
  },
  {
    "replayNumber": 43,
    "name": "Franco Colapinto",
    "gridPosition": 8,
    "finalPosition": 7,
    "team2025": "Alpine",
    "modelKey": "alpine-colapinto",
    "completedLaps": 57
  },
  {
    "replayNumber": 10,
    "name": "Pierre Gasly",
    "gridPosition": 9,
    "finalPosition": 21,
    "team2025": "Alpine",
    "modelKey": "alpine",
    "completedLaps": 4,
    "status": "retired"
  },
  {
    "replayNumber": 27,
    "name": "Nico Hülkenberg",
    "gridPosition": 10,
    "finalPosition": 19,
    "team2025": "Audi",
    "modelKey": "audi-hulkenberg",
    "completedLaps": 7,
    "status": "retired"
  },
  {
    "replayNumber": 30,
    "name": "Liam Lawson",
    "gridPosition": 11,
    "finalPosition": 20,
    "team2025": "Racing Bulls",
    "modelKey": "redbull-lawson",
    "completedLaps": 6,
    "status": "retired"
  },
  {
    "replayNumber": 87,
    "name": "Oliver Bearman",
    "gridPosition": 12,
    "finalPosition": 11,
    "team2025": "Haas F1 Team",
    "modelKey": "haas-bearman",
    "completedLaps": 56
  },
  {
    "replayNumber": 55,
    "name": "Carlos Sainz",
    "gridPosition": 13,
    "finalPosition": 9,
    "team2025": "Williams",
    "modelKey": "williams-sainz",
    "completedLaps": 57
  },
  {
    "replayNumber": 31,
    "name": "Esteban Ocon",
    "gridPosition": 14,
    "finalPosition": 13,
    "team2025": "Haas F1 Team",
    "modelKey": "haas-ocon",
    "completedLaps": 56
  },
  {
    "replayNumber": 23,
    "name": "Alexander Albon",
    "gridPosition": 15,
    "finalPosition": 10,
    "team2025": "Williams",
    "modelKey": "williams-albon",
    "completedLaps": 57
  },
  {
    "replayNumber": 41,
    "name": "Arvid Lindblad",
    "gridPosition": 16,
    "finalPosition": 14,
    "team2025": "Racing Bulls",
    "modelKey": "racingbulls-lindblad",
    "completedLaps": 56
  },
  {
    "replayNumber": 14,
    "name": "Fernando Alonso",
    "gridPosition": 17,
    "finalPosition": 15,
    "team2025": "Aston Martin",
    "modelKey": "astonmartin-alonso",
    "completedLaps": 56
  },
  {
    "replayNumber": 18,
    "name": "Lance Stroll",
    "gridPosition": 18,
    "finalPosition": 17,
    "team2025": "Aston Martin",
    "modelKey": "astonmartin-stroll",
    "completedLaps": 56
  },
  {
    "replayNumber": 77,
    "name": "Valtteri Bottas",
    "gridPosition": 19,
    "finalPosition": 18,
    "team2025": "Cadillac",
    "modelKey": "cadillac-bottas",
    "completedLaps": 55
  },
  {
    "replayNumber": 11,
    "name": "Sergio Pérez",
    "gridPosition": 20,
    "finalPosition": 16,
    "team2025": "Cadillac",
    "modelKey": "cadillac-perez",
    "completedLaps": 56
  },
  {
    "replayNumber": 5,
    "name": "Gabriel Bortoleto",
    "gridPosition": 21,
    "finalPosition": 12,
    "team2025": "Audi",
    "modelKey": "audi",
    "completedLaps": 56
  },
  {
    "replayNumber": 6,
    "name": "Isack Hadjar",
    "gridPosition": 22,
    "finalPosition": 22,
    "team2025": "Red Bull Racing",
    "modelKey": null,
    "completedLaps": 4,
    "status": "retired",
    "pitLaneStart": true,
    "pitStartProgressMeters": -140
  }
]);
export const MIAMI_2026_DISPLAYED = Object.freeze(MIAMI_2026_ROSTER.filter(d => d.modelKey));
export const MIAMI_2026_BY_NUMBER = Object.freeze(Object.fromEntries(MIAMI_2026_ROSTER.map(d => [d.replayNumber,d])));
export const MIAMI_2026_TRACK_LENGTH_METERS = 5412;
// 57 × 5 412 - 308 326 m = 158 m.
export const MIAMI_2026_CONTROL_LINE_OFFSET_METERS = 158;
