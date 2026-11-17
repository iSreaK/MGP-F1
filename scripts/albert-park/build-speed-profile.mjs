import {readFile,writeFile} from 'node:fs/promises';
const laps=JSON.parse(await readFile(new URL('./raw/laps_63.json',import.meta.url),'utf8'));
const telemetry=JSON.parse(await readFile(new URL('./raw/car_data_63.json',import.meta.url),'utf8'))
 .map(row=>({...row,t:Date.parse(row.date)})).sort((a,b)=>a.t-b.t);
const count=880,bins=Array.from({length:count},()=>[]);let used=0;
const percentile=(values,fraction)=>{const v=values.slice().sort((a,b)=>a-b);return v[Math.round((v.length-1)*fraction)];};
for(const lap of laps){
 if(lap.lap_number<3||lap.lap_duration<78||lap.lap_duration>94||lap.is_pit_out_lap)continue;
 const start=Date.parse(lap.date_start),end=start+lap.lap_duration*1000;
 const rows=telemetry.filter(row=>row.t>=start&&row.t<=end&&row.speed>=35&&row.speed<=365);
 if(rows.length<100)continue;
 const distances=[0];for(let i=1;i<rows.length;i++)distances.push(distances.at(-1)+(rows[i-1].speed+rows[i].speed)/7.2*(rows[i].t-rows[i-1].t)/1000);
 const factor=5278/distances.at(-1);used++;
 for(let i=0;i<rows.length;i++)bins[Math.min(count-1,Math.floor(distances[i]*factor/5278*count))].push(rows[i].speed);
}
if(used<8)throw new Error('Insufficient clean Russell laps');
let values=bins.map(bin=>bin.length?percentile(bin,.6):null);
for(let i=0;i<count;i++){if(values[i]!==null)continue;let a=i-1,b=i+1;
 while(values[(a+count)%count]===null)a--;while(values[b%count]===null)b++;
 values[i]=(values[(a+count)%count]+values[b%count])/2;}
values=values.map((_,i)=>[1,2,3,4,3,2,1].reduce((sum,w,j)=>sum+values[(i+j-3+count)%count]*w,0)/16);
const rows=[];for(let i=0;i<count;i+=14)rows.push('  '+values.slice(i,i+14).map(v=>Math.round(v*10)/10).join(', ')+',');
await writeFile(new URL('../../dist/albert-park/free-speed-profile.js',import.meta.url),
 `// Representative dry-race speed from ${used} clean Russell laps, OpenF1 11234.\nexport const FREE_SPEED_PROFILE_KMH = [\n${rows.join('\n')}\n];\n`);
console.log({cleanLaps:used,min:Math.min(...values),max:Math.max(...values),lapSeconds:values.reduce((sum,v)=>sum+5278/count/(v/3.6),0)});
