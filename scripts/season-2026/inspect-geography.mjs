import {readFile,mkdir,writeFile} from 'node:fs/promises';
const names=['montreal','monaco','barcelona','spielberg','silverstone','spa','hungaroring','zandvoort'];
for(const slug of names){const geo=JSON.parse(await readFile(new URL('../'+slug+'/source/geography.geojson',import.meta.url),'utf8'));
 const p=geo.features[0].geometry.coordinates;let a=0;for(let i=1;i<p.length;i++)a+=p[i-1][0]*(-p[i][1])-p[i][0]*(-p[i-1][1]);
 console.log(slug,JSON.stringify({count:p.length,first:p[0],last:p.at(-1),area:a}));
}
const response=await fetch('https://api.multiviewer.app/api/v1/circuits',{signal:AbortSignal.timeout(20000)});
console.log('MultiViewer',response.status);const data=await response.text();
await mkdir(new URL('../../output/qa/',import.meta.url),{recursive:true});
await writeFile(new URL('../../output/qa/multiviewer-circuits.json',import.meta.url),data);console.log(data.slice(0,1200));
