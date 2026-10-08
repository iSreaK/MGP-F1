/** Abu Dhabi's 17:00 start moves from golden hour into floodlit darkness. */
export function createYasMarinaSky(THREE, scene) {
  const phases = [
    ['#12203c','#596276','#efaa73','#f8cf97',false],
    ['#0e1933','#504b66','#dd8c74','#f1b785',false],
    ['#08132b','#2b314b','#9b6272','#d79b76',false],
    ['#050d20','#1c2940','#4b5261','#9a746b',true],
    ['#040916','#152239','#26394e','#6b6266',true],
  ];
  function paint(colors, wet) {
    const canvas=document.createElement('canvas');
    canvas.width=1024;canvas.height=512;
    const ctx=canvas.getContext('2d');
    const gradient=ctx.createLinearGradient(0,0,0,512);
    [0,.46,.77,1].forEach((stop,index)=>gradient.addColorStop(stop,
      wet?['#0a1325','#233145','#566172','#777375'][index]:colors[index]));
    ctx.fillStyle=gradient;ctx.fillRect(0,0,1024,512);
    const glow=ctx.createRadialGradient(780,390,10,780,390,370);
    glow.addColorStop(0,wet?'rgba(188,170,151,.10)':'rgba(255,179,112,.31)');
    glow.addColorStop(1,'rgba(255,179,112,0)');
    ctx.fillStyle=glow;ctx.fillRect(0,0,1024,512);
    if(colors[4]&&!wet){
      let seed=0x2025ab;
      const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
      for(let i=0;i<95;i++){
        const x=random()*1024,y=random()*205,r=.3+random()*.65;
        ctx.fillStyle=`rgba(235,241,247,${(.13+random()*.21).toFixed(2)})`;
        ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
      }
    }
    const map=new THREE.CanvasTexture(canvas);
    map.colorSpace=THREE.SRGBColorSpace;
    map.wrapS=THREE.RepeatWrapping;
    return map;
  }
  const maps=phases.map(colors=>paint(colors,false));
  const rainy=paint(phases[3],true);
  const dome=new THREE.Mesh(new THREE.SphereGeometry(6000,32,16),
    new THREE.MeshBasicMaterial({map:maps[0],side:THREE.BackSide,fog:false,
      depthWrite:false,toneMapped:false}));
  dome.name='Yas Marina sunset-to-night sky';
  dome.frustumCulled=false;dome.renderOrder=-1000;scene.add(dome);
  let wet=false,phase=0;
  const refresh=()=>{dome.material.map=wet?rainy:maps[phase];dome.material.needsUpdate=true;};
  return {
    dome,
    setWet(value){wet=!!value;refresh();},
    setRaceProgress(progress){
      const next=progress<.12?0:progress<.28?1:progress<.46?2:progress<.64?3:4;
      if(next!==phase){phase=next;refresh();}
    },
    follow(position){dome.position.copy(position);},
  };
}
