import {mkdir,writeFile,readFile} from 'node:fs/promises';
const references={montreal:'ca-1978',monaco:'mc-1929',barcelona:'es-1991',spielberg:'at-1969',silverstone:'gb-1948',spa:'be-1925',hungaroring:'hu-1986',zandvoort:'nl-1948'};
const base='https://raw.githubusercontent.com/bacinger/f1-circuits/master/';
async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error(url+' '+r.status);return r.text();}
const license=await readFile(new URL('../miami/source/GEOJSON-LICENSE.txt',import.meta.url),'utf8');
for(const [slug,id] of Object.entries(references)){
 const directory=new URL('../'+slug+'/source/',import.meta.url);await mkdir(directory,{recursive:true});
 const data=await get(base+'circuits/'+id+'.geojson');JSON.parse(data);
 await writeFile(new URL('geography.geojson',directory),data.replace(/[ \t]+(?=\r?$)/gm,''));
 await writeFile(new URL('GEOJSON-LICENSE.md',directory),license);
 console.log(slug,JSON.parse(data).features[0].properties);
}
