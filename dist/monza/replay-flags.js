// Race-control messages are sector-scoped. Keep each sector's latest flag so
// one CLEAR message cannot dismiss a yellow flag elsewhere on the circuit.
const SECTOR_RE = /TRACK SECTOR\s+(\d+)/i;

const FLAG_STYLES = Object.freeze({
  green: { label: 'PISTE LIBRE', tone: 'green', color: '#4dd7a2', priority: 0 },
  yellow: { label: 'DRAPEAU JAUNE', tone: 'yellow', color: '#ffd54a', priority: 1 },
  'double-yellow': { label: 'DOUBLE DRAPEAU JAUNE', tone: 'yellow', color: '#ffd54a', priority: 2 },
  vsc: { label: 'VSC', tone: 'yellow', color: '#ffd54a', priority: 3 },
  'safety-car': { label: 'VOITURE DE SÉCURITÉ', tone: 'yellow', color: '#ffd54a', priority: 4 },
  red: { label: 'DRAPEAU ROUGE', tone: 'red', color: '#ff4b4b', priority: 5 },
  chequered: { label: 'DRAPEAU À DAMIER', tone: 'chequered', color: '#fff', priority: 6 },
});

const eventTime = event => Number(event?.tSec);
const isSectorEvent = event => event?.category === 'Flag' && event.driverNumber == null;
const sectorOf = message => {
  const match = SECTOR_RE.exec(message || '');
  return match ? Number(match[1]) : null;
};
const sectorDetail = sectors => sectors.length === 1
  ? `Secteur ${sectors[0]}`
  : `Secteurs ${sectors.join(', ')}`;

/**
 * Build once when replay data loads, then call `at(seconds)` on every frame.
 * The returned state is based on the historical global race-control feed;
 * local yellows are not claimed to apply to every car at once.
 */
export function createReplayFlagTimeline(data) {
  const events = (data?.events || [])
    .filter(event => Number.isFinite(eventTime(event)))
    .map((event, index) => ({ ...event, index }))
    .sort((a, b) => a.tSec - b.tSec || a.index - b.index);
  const pauses = (data?.session?.pauses || [])
    .filter(pause => Number.isFinite(pause.startSec) && Number.isFinite(pause.endSec))
    .sort((a, b) => a.startSec - b.startSec);

  function at(timeSec) {
    const seconds = Number.isFinite(timeSec) ? timeSec : 0;
    const sectors = new Map();
    let caution = null;
    let chequered = false;
    let redEventActive = false;

    for (const event of events) {
      if (event.tSec > seconds) break;
      const message = String(event.message || '').toUpperCase();
      const sector = sectorOf(message);
      if (isSectorEvent(event)) {
        if (event.flag === 'CHEQUERED') chequered = true;
        else if (message === 'TRACK CLEAR' || message === 'GREEN FLAG') {
          sectors.clear();
          if (caution === 'vsc') caution = null;
        }
        else if (sector !== null && event.flag === 'CLEAR') sectors.delete(sector);
        else if (sector !== null && (event.flag === 'YELLOW' || event.flag === 'DOUBLE YELLOW')) {
          const previous = sectors.get(sector);
          const strength = event.flag === 'DOUBLE YELLOW' ? 2 : 1;
          // At the same timestamp, order within the source batch is arbitrary.
          sectors.set(sector, previous?.time === event.tSec
            ? { time: event.tSec, strength: Math.max(previous.strength, strength) }
            : { time: event.tSec, strength });
        }
      }

      if (message === 'SAFETY CAR DEPLOYED') caution = 'safety-car';
      else if (message === 'VSC DEPLOYED') caution = 'vsc';
      else if (/^(VSC ENDED|SAFETY CAR ENDED|GREEN FLAG)$/.test(message)) caution = null;
      else if (message === 'SESSION ABORTED' || message === 'RED FLAG - RACE SUSPENDED') {
        caution = null;
        redEventActive = true;
      }
      else if (message === 'SESSION STARTED' && event.tSec > 0) {
        caution = null;
        redEventActive = false;
        sectors.clear();
      }
    }

    const pause = pauses.find(item => item.startSec <= seconds && seconds < item.endSec);
    let kind = 'green';
    let detail = '';
    let activeSectors = [];
    if (pause || redEventActive) {
      kind = 'red';
      detail = 'Course interrompue';
    } else if (chequered) {
      kind = 'chequered';
      detail = 'Arrivée';
    } else if (caution) {
      kind = caution;
      detail = caution === 'vsc' ? 'Voiture de sécurité virtuelle' : 'Neutralisation de la course';
    } else if (sectors.size) {
      const strongest = Math.max(...[...sectors.values()].map(item => item.strength));
      kind = strongest === 2 ? 'double-yellow' : 'yellow';
      activeSectors = [...sectors.entries()]
        .filter(([, item]) => item.strength === strongest)
        .map(([sector]) => sector)
        .sort((a, b) => a - b);
      detail = sectorDetail(activeSectors);
    }

    return {
      kind,
      ...FLAG_STYLES[kind],
      detail,
      sectors: activeSectors,
      active: kind !== 'green',
    };
  }

  return { at };
}
