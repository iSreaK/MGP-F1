import { spawn } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const sessionKey = 11361;
const drivers = [3, 1, 44, 10, 12, 5];
const root = path.join(import.meta.dirname, 'raw');
await mkdir(root, { recursive: true });
const range = '&date>=2026-09-06T13:00:00Z&date<2026-09-06T15:05:00Z';
const jobs = drivers.flatMap(number => [
  ['location', `location_${number}`, range],
  ['car_data', `car_data_${number}`, range],
  ['laps', `laps_${number}`, ''],
]);
jobs.push(...['position', 'intervals', 'pit', 'stints', 'race_control', 'weather']
  .map(endpoint => [endpoint, endpoint, '']));

function curl(url, target) {
  return new Promise((resolve, reject) => {
    const child = spawn('curl.exe', [
      '-sS', '--max-time', '120', '-o', target,
      '-w', '%{http_code} %{size_download}', url,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, output: output.trim() }));
  });
}
for (const [endpoint, name, filters] of jobs) {
  const target = path.join(root, `${name}.json`);
  const url = `https://api.openf1.org/v1/${endpoint}?session_key=${sessionKey}${
    name.includes('_') && endpoint !== 'race_control' ? `&driver_number=${name.split('_').at(-1)}` : ''
  }${filters}`;
  let result;
  for (let attempt = 0; attempt < 3; attempt++) {
    result = await curl(url, target);
    if (result.code === 0 && result.output.startsWith('200 ')) break;
    await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 12000 : 30000));
  }
  const bytes = (await stat(target).catch(() => ({ size: 0 }))).size;
  console.log(`${name}: ${result.output} (${bytes} on disk)`);
  if (result.code !== 0 || !result.output.startsWith('200 ')) process.exitCode = 1;
  await new Promise(resolve => setTimeout(resolve, 2100));
}
