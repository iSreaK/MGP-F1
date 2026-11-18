import {wrap,smooth} from './geometry.js';
// Curvature-derived demonstration only. No historical timing or result data.
export function createSimulation(world,count=22){
 const n=Math.ceil(world.length/5),step=world.length/n,profile=new Float64Array(n);
 for(let i=0;i<n;i++)profile[i]=Math.min(325/3.6,Math.max(45/3.6,Math.sqrt(3.6*9.81*world.curvatureAt(i/n).radius)));
 for(let pass=0;pass<4;pass++){
  for(let i=n-1;i>=0;i--)profile[i]=Math.min(profile[i],Math.sqrt(profile[(i+1)%n]**2+2*18*step));
  for(let i=0;i<n;i++)profile[i]=Math.min(profile[i],Math.sqrt(profile[(i-1+n)%n]**2+2*8*step));
 }
 const cars=Array.from({length:count},(_,i)=>({distance:-14-i*8.2,travelled:0,u:wrap((-14-i*8.2)/world.length),lateral:(i%2?-1:1)*2.1,speed:0}));
 let elapsed=0,wet=false;
 function update(dt){elapsed+=dt;
  for(let i=0;i<count;i++){
   const car=cars[i],j=Math.floor(wrap(car.distance/world.length)*n),target=profile[j]*(wet?.82:1);
   car.speed+=Math.max(-18*dt,Math.min(8*dt,target-car.speed));
   const ahead=cars[(i-1+count)%count],gap=wrap((ahead.distance-car.distance)/world.length)*world.length;
   const advance=Math.min(car.speed*dt,Math.max(0,gap-7));
   car.distance+=advance;car.travelled+=advance;car.u=wrap(car.distance/world.length);car.lateral=(i%2?-1:1)*2.1*(1-smooth(car.travelled/120));
  }
  return cars;
 }
 return {cars,update,setWet(value){wet=!!value;},get elapsed(){return elapsed;},profile};
}
