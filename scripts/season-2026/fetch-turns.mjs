import {readFile,writeFile} from 'node:fs/promises';
const list=JSON.parse(await readFile(new URL('../../output/qa/multiviewer-circuits.json',import.meta.url),'utf8'));
const names={montreal:'Montreal',monaco:'Monte Carlo',barcelona:'Catalunya',spielberg:'Spielberg',silverstone:'Silverstone',spa:'Spa-Francorchamps',hungaroring:'Hungaroring',zandvoort:'Zandvoort'};
for(const [slug,name] of Object.entries(names)){
 const info=Object.values(list).find(c=>c.name.toLowerCase()===name.toLowerCase());
 if(!info){console.log(slug,'NAMES',Object.values(list).map(c=>[c.circuitKey,c.name]));continue;}
 const url=`https://api.multiviewer.app/api/v1/circuits/${info.circuitKey}/2026`;
 const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
 console.log(slug,info.circuitKey,response.status);
 if(!response.ok)continue;const data=await response.json();
 await writeFile(new URL('../'+slug+'/source/corner-reference.json',import.meta.url),JSON.stringify(data));
 console.log('data',Object.keys(data),data.corners?.length,data.rotation);
}
