import * as THREE from 'three';
import {OrbitControls} from '../vendor/three/examples/jsm/controls/OrbitControls.js';
import {GLTFLoader} from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import {carCatalog} from '../car-catalog.js';
import {bindWheelSpin} from '../monza/wheel-spin.js';
import {frameCircuitOverview} from '../circuit-framing.js';
import {createCircuitWorld} from './world.js';
import {createSimulation} from './simulation.js';
import {wrap} from './geometry.js';

const $=selector=>document.querySelector(selector),slug=document.body.dataset.circuit;
let renderer,scene,world,camera,controls,mode='overview',running=false,wet=false,field,detail=null,binding=null,selected=0,loadingModel=false,modelWanted=false,requestId=0;
const colours={redbull:0x33489d,ferrari:0xd62c33,alpine:0xed89bc,mclaren:0xf69929,mercedes:0x56c9b9,audi:0xc12c31,racingbulls:0xc1cbe7,haas:0xd5d9da,williams:0x3c72cf,cadillac:0xddddc9,astonmartin:0x27897a};
const entries=carCatalog.map(entry=>({...entry})); // Garage collection; no official race roster/grid is implied.
const queryCar=new URLSearchParams(location.search).get('car');selected=Math.max(0,entries.findIndex(c=>c.key===queryCar));
const proxy=[],up=new THREE.Vector3(0,1,0),matrix=new THREE.Matrix4(),dummy=new THREE.Object3D();let last=0,flyU=0,dirty=true;

function pose(object,state){
 const f=world.frameAt(state.u),across=new THREE.Vector3().crossVectors(f.normal,f.forward).normalize();
 object.position.copy(f.point).addScaledVector(f.across,state.lateral).addScaledVector(f.normal,.025);
 object.quaternion.setFromRotationMatrix(matrix.makeBasis(f.forward.clone().negate(),f.normal,across));
}
function proxyField(){
 const body=new THREE.Group(),parts=[];
 const pieces=[[[3.8,.35,.58],[.08,.44,0]],[[1.5,.18,1.72],[-2.05,.2,0]],[[.58,.2,1.65],[2.05,.75,0]],[[1.4,.16,.86],[.75,.33,0]],[[.7,.32,.45],[.12,.78,0]]];
 const unit=new THREE.BoxGeometry(1,1,1),positions=[],normals=[],indices=[];
 for(const [scale,pos] of pieces){const g=unit.clone();g.scale(...scale);g.translate(...pos);const offset=positions.length/3;positions.push(...g.attributes.position.array);normals.push(...g.attributes.normal.array);for(const i of g.index.array)indices.push(offset+i);g.dispose();}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setIndex(indices);
 const bodies=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({color:0xffffff,roughness:.5}),entries.length);bodies.name='Lightweight garage car bodies';scene.add(bodies);
 const wheelGeometry=new THREE.CylinderGeometry(.36,.36,.29,10);wheelGeometry.rotateX(Math.PI/2);
 const wheels=new THREE.InstancedMesh(wheelGeometry,new THREE.MeshStandardMaterial({color:0x20252b}),entries.length*4);wheels.name='Lightweight garage car tyres';scene.add(wheels);
 for(let i=0;i<entries.length;i++){bodies.setColorAt(i,new THREE.Color(colours[entries[i].teamKey]||0xffffff));proxy.push(new THREE.Object3D());}
 return {bodies,wheels};
}
let meshes;
function updateCars(){
 for(let i=0;i<entries.length;i++){
  const car=proxy[i],state=field.cars[i];pose(car,state);car.updateMatrix();
  if(detail&&i===selected){pose(detail,state);binding?.setDistance(state.travelled);dummy.position.copy(car.position);dummy.scale.setScalar(0);dummy.updateMatrix();meshes.bodies.setMatrixAt(i,dummy.matrix);}else meshes.bodies.setMatrixAt(i,car.matrix);
  let w=0;for(const x of [-1.55,1.70])for(const z of [-.77,.77]){
   dummy.position.set(x,.36,z).applyMatrix4(car.matrix);dummy.quaternion.copy(car.quaternion);dummy.scale.setScalar(detail&&i===selected?0:1);dummy.updateMatrix();meshes.wheels.setMatrixAt(i*4+w++,dummy.matrix);
  }
 }
 meshes.bodies.instanceMatrix.needsUpdate=true;meshes.wheels.instanceMatrix.needsUpdate=true;
 const visible=mode==='grid'||mode==='simulation';meshes.bodies.visible=meshes.wheels.visible=visible;if(detail)detail.visible=visible;
}
function disposeModel(){if(!detail)return;binding?.dispose();binding=null;scene.remove(detail);detail.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const value of Object.values(m))if(value?.isTexture)value.dispose();m.dispose();}}});detail=null;}
async function loadSelected(){
 const id=++requestId;disposeModel();if(!modelWanted){updateCars();return;}
 loadingModel=true;$('#detail').textContent='Chargement du modèle…';$('#detail').disabled=true;
 try{
  const gltf=await new GLTFLoader().loadAsync(new URL(entries[selected].url,new URL('../',import.meta.url)).href);
  if(id!==requestId){gltf.scene.traverse(o=>{if(o.isMesh)o.geometry.dispose();});return;}
  detail=gltf.scene;detail.name=entries[selected].driverName+' garage model';scene.add(detail);binding=bindWheelSpin(THREE,detail);updateCars();
 }catch(error){console.error(error);modelWanted=false;$('#status').textContent='Le modèle détaillé n’a pas chargé. Vous pouvez réessayer.';}
 finally{if(id===requestId){loadingModel=false;$('#detail').disabled=false;$('#detail').textContent=modelWanted?'Modèle détaillé ✓':'Modèle détaillé';$('#detail').setAttribute('aria-pressed',String(modelWanted));dirty=true;}}
}
function overview(){const position=new THREE.Vector3(),target=new THREE.Vector3();frameCircuitOverview(THREE,camera,world.bounds,position,target);camera.position.copy(position);controls.target.copy(target);camera.up.copy(up);controls.update();dirty=true;}
function gridView(){const car=proxy[selected],f=world.frameAt(field.cars[selected].u);camera.position.copy(car.position).addScaledVector(f.across,10).addScaledVector(f.forward,-10).add(new THREE.Vector3(0,5,0));controls.target.copy(car.position).add(new THREE.Vector3(0,.8,0));controls.update();dirty=true;}
function setMode(next){mode=next;running=next==='simulation';controls.enabled=next==='overview'||next==='grid';$('#pause').hidden=next!=='simulation';$('#hud').hidden=next!=='simulation';$('#pause').textContent='Pause';
 for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===next));
 $('#model-panel').hidden=next==='overview'||next==='flyover';updateCars();if(next==='overview')overview();if(next==='grid')gridView();dirty=true;
}
function drawMap(config,points){
 const xs=points.map(p=>p[0]),zs=points.map(p=>p[2]),minX=Math.min(...xs),minZ=Math.min(...zs),width=Math.max(...xs)-minX,height=Math.max(...zs)-minZ,pad=Math.max(width,height)*.08;
 const svg=$('#minimap');svg.setAttribute('viewBox',`${minX-pad} ${minZ-pad} ${width+pad*2} ${height+pad*2}`);
 $('#map-path').setAttribute('d','M'+points.map(p=>p[0]+','+p[2]).join(' L')+' Z');$('#map-path').setAttribute('stroke-width',Math.max(width,height)*.009);
 for(const t of Object.values(config.turns)){const text=document.createElementNS('http://www.w3.org/2000/svg','text');text.setAttribute('x',t.position[0]);text.setAttribute('y',t.position[2]);text.setAttribute('font-size',Math.max(width,height)*.036);text.textContent=t.number;svg.append(text);}
 const start=points[0];$('#map-start').setAttribute('cx',start[0]);$('#map-start').setAttribute('cy',start[2]);$('#map-start').setAttribute('r',Math.max(width,height)*.014);
}
function tick(time){
 requestAnimationFrame(tick);if(document.hidden){last=time;return;}const dt=Math.min(.05,(time-last)/1000||0);last=time;
 if(mode==='simulation'){
  if(running)field.update(dt);updateCars();const s=field.cars[selected],f=world.frameAt(s.u),point=proxy[selected].position;
  const position=point.clone().addScaledVector(f.forward,-17).addScaledVector(f.across,4).add(new THREE.Vector3(0,7,0));camera.position.lerp(position,1-Math.exp(-5*dt));camera.lookAt(point.clone().addScaledVector(f.forward,12));
  $('#speed').textContent=Math.round(s.speed*3.6);$('#lap').textContent=1+Math.floor(s.travelled/world.length);$('#time').textContent=(field.elapsed).toFixed(1)+' s';dirty=true;
 }else if(mode==='flyover'){
  flyU=wrap(flyU+dt*48/world.length);const f=world.frameAt(flyU),p=world.at(flyU*world.length,42,65);camera.position.copy(p);camera.lookAt(world.at(flyU*world.length+75));dirty=true;
 }else if(controls.update())dirty=true;
 if(dirty){
  const focusDistance=mode==='simulation'?camera.position.distanceTo(proxy[selected].position):mode==='flyover'?camera.position.distanceTo(world.frameAt(flyU).point):camera.position.distanceTo(controls.target);
  const near=Math.max(.15,Math.min(200,focusDistance/40));if(Math.abs(camera.near-near)>near*.02){camera.near=near;camera.updateProjectionMatrix();}
  renderer.render(scene,camera);dirty=false;
 }
}
async function start(){
 const [{TRACK_POINTS,CONFIG},{addEnvironment}]=await Promise.all([import('../'+slug+'/track-data.js'),import('../'+slug+'/environment.js')]);
 renderer=new THREE.WebGLRenderer({canvas:$('#scene'),antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
 scene=new THREE.Scene();scene.background=new THREE.Color(0xc1d7df);scene.fog=new THREE.Fog(0xc1d7df,9000,19000);
 scene.add(new THREE.HemisphereLight(0xdceff7,0x6d704a,2.5));const sun=new THREE.DirectionalLight(0xfff0d4,3.3);sun.position.set(-900,1500,500);scene.add(sun);
 world=createCircuitWorld(THREE,scene,TRACK_POINTS,CONFIG,addEnvironment);camera=new THREE.PerspectiveCamera(43,innerWidth/innerHeight,.2,45000);controls=new OrbitControls(camera,$('#scene'));controls.minDistance=5;controls.maxDistance=19000;controls.maxPolarAngle=Math.PI*.49;controls.enableDamping=true;controls.addEventListener('change',()=>{dirty=true;});
 const visits=world.environment.landmarks.filter(l=>l.userData.cameraBounds&&Math.max(...l.userData.cameraBounds.size)<1800);
 for(const id of ['T1',...(CONFIG.banking||[]).map(b=>b.turn)]){const t=CONFIG.turns[id];visits.push({name:id+' · '+(id==='T3'&&slug==='zandvoort'?'Hugenholtzbocht':id==='T14'&&slug==='zandvoort'?'Arie Luyendykbocht':'Virage '+t.number),userData:{cameraBounds:{center:t.position,size:[90,10,90]}}});}
 for(let i=0;i<visits.length;i++){const option=document.createElement('option');option.value=i;option.textContent=visits[i].name;$('#visit').append(option);}
 $('#visit').addEventListener('change',()=>{if($('#visit').value==='')return;const b=visits[Number($('#visit').value)].userData.cameraBounds,r=Math.max(50,Math.max(b.size[0],b.size[2])*.6);setMode('overview');controls.target.set(...b.center);camera.position.copy(controls.target).add(new THREE.Vector3(r*.8,r*.8,r));controls.update();dirty=true;});
 field=createSimulation(world,entries.length);meshes=proxyField();updateCars();overview();drawMap(CONFIG,TRACK_POINTS);
 for(let i=0;i<entries.length;i++){const option=document.createElement('option');option.value=i;option.textContent=entries[i].driverName+' · '+entries[i].name;$('#car').append(option);}$('#car').value=selected;
 for(const button of document.querySelectorAll('[data-view]')){button.disabled=false;button.addEventListener('click',()=>setMode(button.dataset.view));}
 $('#pause').addEventListener('click',()=>{running=!running;$('#pause').textContent=running?'Pause':'Reprendre';});
 $('#reset').addEventListener('click',()=>{field=createSimulation(world,entries.length);field.setWet(wet);updateCars();if(mode==='grid')gridView();dirty=true;});
 $('#detail').addEventListener('click',()=>{modelWanted=!modelWanted;loadSelected();});
 $('#car').addEventListener('change',()=>{selected=Number($('#car').value);if(modelWanted)loadSelected();if(mode==='grid')gridView();dirty=true;});
 $('#weather').addEventListener('click',()=>{wet=!wet;field.setWet(wet);world.trackMaterial.roughness=wet?.28:.85;world.trackMaterial.color.set(wet?0x454d54:0x666b6c);scene.background.set(wet?0x8298a7:0xc1d7df);scene.fog.color.copy(scene.background);sun.intensity=wet?1.2:3.3;$('#weather').textContent=wet?'Temps · humide':'Temps · sec';$('#weather').setAttribute('aria-pressed',String(wet));dirty=true;});
 $('#help-toggle').addEventListener('click',()=>{$('#info').classList.toggle('compact');$('#help-toggle').setAttribute('aria-expanded',String(!$('#info').classList.contains('compact')));});
 addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);if(mode==='overview')overview();dirty=true;});
 $('#loading').hidden=true;$('#status').textContent='';document.body.dataset.ready='true';requestAnimationFrame(tick);
}
start().catch(error=>{console.error(error);$('#loading-message').textContent='Le circuit n’a pas pu charger. Rechargez la page pour réessayer.';$('#loading').classList.add('failed');});
