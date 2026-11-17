// Official Japanese GP 29 March 2026: all 22 starters, Hadjar without a local asset.
// https://www.formula1.com/en/results/2026/races/1281/japan/starting-grid
// https://www.formula1.com/en/results/2026/races/1281/japan/race-result
export const SUZUKA_2026_ROSTER = Object.freeze([
  {
    "replayNumber": 12,
    "name": "Kimi Antonelli",
    "gridPosition": 1,
    "finalPosition": 1,
    "team2026": "Mercedes",
    "modelKey": "mercedes",
    "completedLaps": 53
  },
  {
    "replayNumber": 63,
    "name": "George Russell",
    "gridPosition": 2,
    "finalPosition": 4,
    "team2026": "Mercedes",
    "modelKey": "mercedes-russell",
    "completedLaps": 53
  },
  {
    "replayNumber": 81,
    "name": "Oscar Piastri",
    "gridPosition": 3,
    "finalPosition": 2,
    "team2026": "McLaren",
    "modelKey": "mclaren-piastri",
    "completedLaps": 53
  },
  {
    "replayNumber": 16,
    "name": "Charles Leclerc",
    "gridPosition": 4,
    "finalPosition": 3,
    "team2026": "Ferrari",
    "modelKey": "ferrari-leclerc",
    "completedLaps": 53
  },
  {
    "replayNumber": 1,
    "name": "Lando Norris",
    "gridPosition": 5,
    "finalPosition": 5,
    "team2026": "McLaren",
    "modelKey": "mclaren",
    "completedLaps": 53
  },
  {
    "replayNumber": 44,
    "name": "Lewis Hamilton",
    "gridPosition": 6,
    "finalPosition": 6,
    "team2026": "Ferrari",
    "modelKey": "ferrari",
    "completedLaps": 53
  },
  {
    "replayNumber": 10,
    "name": "Pierre Gasly",
    "gridPosition": 7,
    "finalPosition": 7,
    "team2026": "Alpine",
    "modelKey": "alpine",
    "completedLaps": 53
  },
  {
    "replayNumber": 6,
    "name": "Isack Hadjar",
    "gridPosition": 8,
    "finalPosition": 12,
    "team2026": "Red Bull Racing",
    "modelKey": null,
    "completedLaps": 53
  },
  {
    "replayNumber": 5,
    "name": "Gabriel Bortoleto",
    "gridPosition": 9,
    "finalPosition": 13,
    "team2026": "Audi",
    "modelKey": "audi",
    "completedLaps": 53
  },
  {
    "replayNumber": 41,
    "name": "Arvid Lindblad",
    "gridPosition": 10,
    "finalPosition": 14,
    "team2026": "Racing Bulls",
    "modelKey": "racingbulls-lindblad",
    "completedLaps": 53
  },
  {
    "replayNumber": 3,
    "name": "Max Verstappen",
    "gridPosition": 11,
    "finalPosition": 8,
    "team2026": "Red Bull Racing",
    "modelKey": "redbull",
    "completedLaps": 53
  },
  {
    "replayNumber": 31,
    "name": "Esteban Ocon",
    "gridPosition": 12,
    "finalPosition": 10,
    "team2026": "Haas F1 Team",
    "modelKey": "haas-ocon",
    "completedLaps": 53
  },
  {
    "replayNumber": 27,
    "name": "Nico Hulkenberg",
    "gridPosition": 13,
    "finalPosition": 11,
    "team2026": "Audi",
    "modelKey": "audi-hulkenberg",
    "completedLaps": 53
  },
  {
    "replayNumber": 30,
    "name": "Liam Lawson",
    "gridPosition": 14,
    "finalPosition": 9,
    "team2026": "Racing Bulls",
    "modelKey": "redbull-lawson",
    "completedLaps": 53
  },
  {
    "replayNumber": 43,
    "name": "Franco Colapinto",
    "gridPosition": 15,
    "finalPosition": 16,
    "team2026": "Alpine",
    "modelKey": "alpine-colapinto",
    "completedLaps": 53
  },
  {
    "replayNumber": 55,
    "name": "Carlos Sainz",
    "gridPosition": 16,
    "finalPosition": 15,
    "team2026": "Williams",
    "modelKey": "williams-sainz",
    "completedLaps": 53
  },
  {
    "replayNumber": 23,
    "name": "Alexander Albon",
    "gridPosition": 17,
    "finalPosition": 20,
    "team2026": "Williams",
    "modelKey": "williams-albon",
    "completedLaps": 51
  },
  {
    "replayNumber": 87,
    "name": "Oliver Bearman",
    "gridPosition": 18,
    "finalPosition": 22,
    "team2026": "Haas F1 Team",
    "modelKey": "haas-bearman",
    "completedLaps": 20,
    "status": "retired"
  },
  {
    "replayNumber": 11,
    "name": "Sergio Perez",
    "gridPosition": 19,
    "finalPosition": 17,
    "team2026": "Cadillac",
    "modelKey": "cadillac-perez",
    "completedLaps": 53
  },
  {
    "replayNumber": 77,
    "name": "Valtteri Bottas",
    "gridPosition": 20,
    "finalPosition": 19,
    "team2026": "Cadillac",
    "modelKey": "cadillac-bottas",
    "completedLaps": 52
  },
  {
    "replayNumber": 14,
    "name": "Fernando Alonso",
    "gridPosition": 21,
    "finalPosition": 18,
    "team2026": "Aston Martin",
    "modelKey": "astonmartin-alonso",
    "completedLaps": 52
  },
  {
    "replayNumber": 18,
    "name": "Lance Stroll",
    "gridPosition": 22,
    "finalPosition": 21,
    "team2026": "Aston Martin",
    "modelKey": "astonmartin-stroll",
    "completedLaps": 30,
    "status": "retired"
  }
]);
export const SUZUKA_2026_BY_NUMBER=Object.freeze(Object.fromEntries(SUZUKA_2026_ROSTER.map(d=>[d.replayNumber,d])));
export const SUZUKA_2026_DISPLAYED=Object.freeze(SUZUKA_2026_ROSTER.filter(d=>d.modelKey));
export const SUZUKA_2026_TRACK_LENGTH_METERS=5807;
// 53*5807 - 307471 = 300 m.
export const SUZUKA_2026_CONTROL_LINE_OFFSET_METERS=300;
