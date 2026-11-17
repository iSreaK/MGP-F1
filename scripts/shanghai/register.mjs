import{readFile,writeFile}from'node:fs/promises';
const raw=JSON.parse(await readFile('scripts/shanghai/geo.json','utf8')).features[0].geometry.coordinates;
const ref=[121.2214,31.3406];let geo=raw.map(([a,b])=>[(a-ref[0])*111320*Math.cos(ref[1]*Math.PI/180),-(b-ref[1])*111320]);
function sampled(a,n=1000){let c=[0];for(let i=1;i<a.length;i++)c.push(c.at(-1)+Math.hypot(a[i][0]-a[i-1][0],a[i][1]-a[i-1][1]));let j=0;return{length:c.at(-1),points:Array.from({length:n},(_,i)=>{let d=i/n*c.at(-1);while(c[j+1]<d)j++;let t=(d-c[j])/(c[j+1]-c[j]);return a[j].map((v,k)=>v+(a[j+1][k]-v)*t)})}}
let g=sampled(geo);let m=JSON.parse(await readFile('scripts/shanghai/circuit.json','utf8'));let mv=m.x.map((x,i)=>[x,-m.y[i]]);mv.push(mv[0]);let v=sampled(mv);
function centred(a){let c=[0,0];for(const p of a){c[0]+=p[0]/a.length;c[1]+=p[1]/a.length}return a.map(p=>[p[0]-c[0],p[1]-c[1]])}
let gc=centred(g.points),vc=centred(v.points);let best={err:Infinity};for(let reflect of [1,-1])for(let shift=0;shift<1000;shift++){let a=0,b=0,den=0;for(let i=0;i<1000;i++){let p=vc[i],q=gc[(i+shift)%1000];a+=p[0]*q[0]+p[1]*reflect*q[1];b+=p[0]*q[1]-p[1]*reflect*q[0];den+=p[0]**2+p[1]**2}let re=a/den,im=b/den,err=0;for(let i=0;i<1000;i++){let p=vc[i],q=gc[(i+shift)%1000];err+=(re*p[0]-im*p[1]*reflect-q[0])**2+(im*p[0]+re*p[1]*reflect-q[1])**2}if(err<best.err)best={err,shift,reflect,re,im}}
console.log('geolength',g.length,'fit',best,'rmse',Math.sqrt(best.err/1000));
await writeFile('scripts/shanghai/registration.json',JSON.stringify({reference:ref,...best,geoLength:g.length}));
