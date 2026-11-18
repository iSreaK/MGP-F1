import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import {TRACK_POINTS,CONFIG} from '../dist/hungaroring/track-data.js';
import {createCircuitWorld} from '../dist/circuits-2026/world.js';
import {addEnvironment} from '../dist/hungaroring/environment.js';

globalThis.document={createElement(){return{width:1,height:1,getContext(){return{createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},fillRect(){},fillText(){}};}};}};
const scene=new THREE.Scene(),config=structuredClone(CONFIG);config.pit.building=false;
const world=createCircuitWorld(THREE,scene,TRACK_POINTS,config,addEnvironment),environment=world.environment;scene.updateMatrixWorld(true);
assert.equal(environment.stats.garageBays,40);
assert.equal(environment.stats.mainRoofSections,21);
assert.ok(environment.stats.grandstands>=8,'main and corner viewing areas are present');
assert.equal(environment.stats.trees,1900);
assert.equal(environment.stats.cornerSigns,14);
assert.ok(environment.stats.hospitalitySuites>=9);
assert.ok(scene.getObjectByName('Grande tribune — 21 modules de toiture'));
assert.ok(scene.getObjectByName('Paddock — bâtiment de 338,5 m'));
let checked=0,minimum=Infinity,meshes=0,instances=0,excludedByBounds=0;
const matrix=new THREE.Matrix4(),point=new THREE.Vector3(),centre=new THREE.Vector3(),scale=new THREE.Vector3();
for(const landmark of environment.landmarks){
  if(landmark.userData.kind==='landscape')continue;
  landmark.traverse(mesh=>{
    if(!mesh.isMesh)return;meshes++;mesh.geometry.computeBoundingSphere();const attribute=mesh.geometry.getAttribute('position');
    for(let item=0;item<(mesh.isInstancedMesh?mesh.count:1);item++){
      instances++;
      if(mesh.isInstancedMesh){mesh.getMatrixAt(item,matrix);matrix.premultiply(mesh.matrixWorld);}else matrix.copy(mesh.matrixWorld);
      centre.copy(mesh.geometry.boundingSphere.center).applyMatrix4(matrix);scale.setFromMatrixScale(matrix);
      const radius=mesh.geometry.boundingSphere.radius*Math.max(scale.x,scale.y,scale.z);
      if(world.drivingDistance(centre.x,centre.z)>radius+11){excludedByBounds++;continue;}
      for(let vertex=0;vertex<attribute.count;vertex++){
        point.fromBufferAttribute(attribute,vertex).applyMatrix4(matrix);const distance=world.drivingDistance(point.x,point.z);minimum=Math.min(minimum,distance);checked++;
        assert.ok(distance>=9.99,`${mesh.name} intersects the 4 m road/pit reserve: ${distance.toFixed(3)} m from centreline`);
      }
    }
  });
}
assert.ok(minimum>=10);
console.log('Hungaroring environment:',JSON.stringify({stats:environment.stats,checkedNearRoadVertices:checked,minimumRoadEdgeReserve:minimum-6,meshes,instances,excludedByBounds,batching:world.batching}));
