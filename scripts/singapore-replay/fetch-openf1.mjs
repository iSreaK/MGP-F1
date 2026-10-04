#!/usr/bin/env node
// Download the actual 2025 Singapore GP archive. No telemetry is generated.
// An optional OPENF1_ACCESS_TOKEN is used only in request headers, never saved.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SINGAPORE_2025_ROSTER } from '../../dist/singapore/replay-roster.js';

const base = 'https://api.openf1.org/v1';
const rawDir = process.env.SINGAPORE_REPLAY_RAW_DIR || path.join(import.meta.dirname, 'raw');
const accessToken = process.env.OPENF1_ACCESS_TOKEN?.trim();
const overrideKey = process.env.SINGAPORE_2025_SESSION_KEY?.trim();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
await mkdir(rawDir, { recursive: true });

async function request(endpoint, query, allowNotFound = false) {
  const url = new URL(`${base}/${endpoint}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await fetch(url, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      signal: AbortSignal.timeout(120_000),
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error(`OpenF1 HTTP ${response.status} pour ${endpoint}. L'archive historique nécessite peut-être un accès OpenF1 ; définir OPENF1_ACCESS_TOKEN dans l'environnement local, puis relancer. Aucun jeton n'est écrit sur disque.`);
    }
    if (response.status === 404 && allowNotFound) return [];
    if (!response.ok) {
      if ((response.status === 429 || response.status >= 500) && attempt < 5) {
        await sleep(8_000 * attempt);
        continue;
      }
      throw new Error(`OpenF1 HTTP ${response.status} pour ${endpoint}.`);
    }
    const result = await response.json();
    if (!Array.isArray(result)) throw new Error(`Réponse ${endpoint} inattendue : tableau JSON requis.`);
    return result;
  }
  throw new Error(`OpenF1 indisponible pour ${endpoint}.`);
}

function isRaceSession(session) {
  return session?.year === 2025 && session?.country_name === 'Singapore'
    && session?.session_name === 'Race'
    && String(session?.date_start || '').startsWith('2025-10-05');
}

async function resolveSession() {
  const query = overrideKey
    ? { session_key: overrideKey }
    : { year: 2025, country_name: 'Singapore', session_name: 'Race' };
  const sessions = await request('sessions', query);
  const session = sessions.find(isRaceSession);
  if (!session || !Number.isInteger(session.session_key)) {
    throw new Error('Session de course du GP de Singapour du 5 octobre 2025 introuvable.');
  }
  return session;
}

async function cachedOrFetch(name, endpoint, query, sessionKey) {
  const filename = path.join(rawDir, `${name}.json`);
  try {
    const cached = JSON.parse(await readFile(filename, 'utf8'));
    if (Array.isArray(cached) && cached.length
      && cached.every(row => row.session_key === sessionKey)) {
      console.log(`${name}: ${cached.length} lignes en cache`);
      return;
    }
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
  }
  const rows = await request(endpoint, { session_key: sessionKey, ...query });
  if (!rows.length || rows.some(row => row.session_key !== sessionKey)) {
    throw new Error(`${name}: données vides ou provenant d'une autre session.`);
  }
  const temporary = `${filename}.part`;
  await writeFile(temporary, JSON.stringify(rows));
  await rename(temporary, filename);
  console.log(`${name}: ${rows.length} lignes enregistrées`);
  await sleep(2_100);
}

async function cachedOrFetchWindowed(name, endpoint, driverNumber, start, end, sessionKey) {
  const filename = path.join(rawDir, `${name}.json`);
  try {
    const cached = JSON.parse(await readFile(filename, 'utf8'));
    if (Array.isArray(cached) && cached.length >= 100
      && cached.every(row => row.session_key === sessionKey
        && row.driver_number === driverNumber)) {
      console.log(`${name}: ${cached.length} lignes en cache`);
      return;
    }
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
  }
  const startMs = Date.parse(start), endMs = Date.parse(end);
  const stepMs = 60 * 60_000;
  const chunks = [];
  for (let from = startMs, index = 0; from < endMs; from += stepMs, index++) {
    const to = Math.min(from + stepMs, endMs);
    const partName = `${name}_part_${index}`;
    const partFile = path.join(rawDir, `${partName}.json`);
    let part = null;
    try {
      const cached = JSON.parse(await readFile(partFile, 'utf8'));
      if (Array.isArray(cached) && cached.every(row => row.session_key === sessionKey
        && row.driver_number === driverNumber)) part = cached;
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    }
    if (!part) {
      part = await request(endpoint, {
        session_key: sessionKey, driver_number: driverNumber,
        'date>': new Date(from).toISOString(), 'date<': new Date(to).toISOString(),
      }, true);
      if (part.some(row => row.session_key !== sessionKey || row.driver_number !== driverNumber)) {
        throw new Error(`${partName}: lignes appartenant à une autre session ou un autre pilote.`);
      }
      const temporary = `${partFile}.part`;
      await writeFile(temporary, JSON.stringify(part));
      await rename(temporary, partFile);
      console.log(`${partName}: ${part.length} lignes`);
      await sleep(2_100);
    }
    chunks.push(...part);
  }
  if (chunks.length < 100) throw new Error(`${name}: moins de cent mesures authentiques.`);
  chunks.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const temporary = `${filename}.part`;
  await writeFile(temporary, JSON.stringify(chunks));
  await rename(temporary, filename);
  console.log(`${name}: ${chunks.length} lignes regroupées`);
}

const session = await resolveSession();
const sessionKey = session.session_key;
const start = new Date(Date.parse(session.date_start) - 10 * 60_000).toISOString();
const end = new Date((session.date_end ? Date.parse(session.date_end)
  : Date.parse(session.date_start) + 3 * 60 * 60_000) + 10 * 60_000).toISOString();
if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end))) {
  throw new Error('Dates de session OpenF1 invalides.');
}
await writeFile(path.join(rawDir, 'session.json'), JSON.stringify(session, null, 2));
console.log(`Singapour 2025 · session ${sessionKey} · ${start} → ${end}`);

for (const driver of SINGAPORE_2025_ROSTER) {
  const number = driver.replayNumber;
  await cachedOrFetch(`laps_${number}`, 'laps', { driver_number: number }, sessionKey);
  for (const endpoint of ['location', 'car_data']) {
    await cachedOrFetchWindowed(`${endpoint}_${number}`, endpoint,
      number, start, end, sessionKey);
  }
}
for (const endpoint of ['position', 'intervals', 'pit', 'stints', 'race_control', 'weather']) {
  await cachedOrFetch(endpoint, endpoint, {}, sessionKey);
}
console.log('Archive complète : 20 pilotes, dont Hadjar sans modèle 3D.');
