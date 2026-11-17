import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ALBERT_PARK_2026_ROSTER as roster } from '../../dist/albert-park/replay-roster.js';
const raw = path.join(import.meta.dirname,'raw');
await mkdir(raw,{recursive:true});
const session = JSON.parse(await readFile(path.join(import.meta.dirname,'source/sessions.json'),'utf8')).find(row=>row.session_key===11234);
await writeFile(path.join(raw,'session.json'),JSON.stringify(session));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function get(name,endpoint,params={}) {
  const file=path.join(raw,name+'.json');
  try { const rows=JSON.parse(await readFile(file,'utf8')); if(Array.isArray(rows)) { console.log(name+': cache '+rows.length); return; } } catch {}
  const url=new URL('https://api.openf1.org/v1/'+endpoint);
  for(const [key,value] of Object.entries({session_key:11234,...params}))url.searchParams.set(key,value);
  for(let attempt=0;attempt<6;attempt++) {
    let response;
    try{response=await fetch(url,{headers:{'User-Agent':'MGP-F1-3D-reference/1.0','Connection':'close'},signal:AbortSignal.timeout(90000)});}
    catch(error){if(attempt===5)throw new Error(name+': '+error.message);await sleep(4000*(attempt+1));continue;}
    if(response.status===429||response.status>=500){await sleep(8000*(attempt+1));continue;}
    if(response.status===404){await writeFile(file,'[]');console.log(name+': empty');return;}
    if(!response.ok)throw new Error(name+': HTTP '+response.status);
    const rows=await response.json();if(!Array.isArray(rows))throw new Error('Invalid '+name);
    await writeFile(file,JSON.stringify(rows));console.log(name+': '+rows.length);await sleep(2100);return;
  }
  throw new Error('OpenF1 retries exceeded: '+name);
}
for(const driver of roster.filter(d=>d.status!=='dns')) {
  const number=driver.replayNumber;
  await get('laps_'+number,'laps',{driver_number:number});
  for(const endpoint of ['location','car_data'])await get(endpoint+'_'+number,endpoint,{driver_number:number,
    'date>':'2026-03-08T03:59:00Z','date<':'2026-03-08T05:26:00Z'});
}
for(const endpoint of ['position','intervals','pit','stints','race_control','weather'])await get(endpoint,endpoint);
console.log('Authentic OpenF1 race archive complete.');
