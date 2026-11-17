import * as THREE from '../../dist/vendor/three/build/three.module.js';
const circuit=process.argv[2]||'suzuka';
const module=await import(`../../dist/${circuit}/world.js`);
const createWorld=module[Object.keys(module).find(key=>/^create.*World$/.test(key))];
globalThis.document={createElement(){return{width:1,height:1,getContext(){return new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})},{get:(o,k)=>o[k]||(()=>{})});}};}};
const t=performance.now(),scene=new THREE.Scene(),world=createWorld(THREE,scene);scene.updateMatrixWorld(true);
const counts={objects:0,meshes:0,instancedMeshes:0,drawCallsFullScene:0,triangles:0,vertices:0,shadowDrawCalls:0,geometryBytes:0,textureBytes:0,buildMs:Math.round(performance.now()-t)};
const materials=new Set(),geometries=new Set(),textures=new Set(),parts=new Map();
scene.traverse(o=>{counts.objects++;if(!o.isMesh&&!o.isLine)return;counts.drawCallsFullScene+=(Array.isArray(o.material)?o.geometry?.groups.length:1)||1;if(o.castShadow)counts.shadowDrawCalls+=(Array.isArray(o.material)?o.geometry?.groups.length:1)||1;const part=o.isMesh?(o.isInstancedMesh?'instanced':'mesh'):'line';const p=parts.get(part)||{objects:0,triangles:0};p.objects++;if(o.isMesh){counts.meshes++;if(o.isInstancedMesh)counts.instancedMeshes++;const n=((o.geometry.index?.count??o.geometry.attributes.position.count)/3)*(o.count??1);counts.triangles+=n;p.triangles+=n;}parts.set(part,p);geometries.add(o.geometry);for(const m of(Array.isArray(o.material)?o.material:[o.material])){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});
for(const g of geometries){counts.vertices+=g.attributes.position.count;for(const a of Object.values(g.attributes))counts.geometryBytes+=a.array.byteLength;counts.geometryBytes+=g.index?.array.byteLength??0;}
for(const texture of textures)counts.textureBytes+=(texture.image?.width??0)*(texture.image?.height??0)*4;
counts.materials=materials.size;counts.geometries=geometries.size;counts.textures=textures.size;
const camera=new THREE.PerspectiveCamera();camera.position.set(0,10000,0);camera.updateMatrixWorld(true);
scene.traverse(o=>{if(o.isLOD)o.update(camera);});
const distant={drawCalls:0,triangles:0};scene.traverseVisible(o=>{if(!o.isMesh&&!o.isLine)return;distant.drawCalls+=(Array.isArray(o.material)?o.geometry.groups.length:1)||1;if(o.isMesh)distant.triangles+=((o.geometry.index?.count??o.geometry.attributes.position.count)/3)*(o.count??1);});
console.log(JSON.stringify({circuit,counts,batching:world.environment.batching,distant,parts:Object.fromEntries(parts)},null,2));
const list=[];scene.traverse(o=>{if(o.isMesh)list.push([o.name,Math.round((o.geometry.index?.count??o.geometry.attributes.position.count)/3)*(o.count??1)]);});if(process.argv.includes('--verbose'))console.log(list.sort((a,b)=>b[1]-a[1]).slice(0,20));
