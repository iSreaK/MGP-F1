import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import { frameCircuitOverview } from '../dist/circuit-framing.js';

for (const slug of ['albert-park','shanghai','suzuka','miami']) {
  const {TRACK_POINTS}=await import(`../dist/${slug}/track-data.js`);
  const points=TRACK_POINTS.map(([x,z])=>new THREE.Vector3(x,0,z));
  const bounds=new THREE.Box3().setFromPoints(points).expandByScalar(180);
  for(const aspect of [1280/720,1100/836,390/844]) {
    const camera=new THREE.PerspectiveCamera(41,aspect,.5,20000);
    const target=new THREE.Vector3();
    frameCircuitOverview(THREE,camera,bounds,camera.position,target);
    camera.lookAt(target);camera.updateMatrixWorld(true);
    for(const point of points) {
      const projected=point.clone().project(camera);
      assert.ok(projected.x>-.99&&projected.x<.99,`${slug}: horizontal clipping at ${aspect}`);
      assert.ok(projected.y>-.45&&projected.y<.82,`${slug}: controls cover overview at ${aspect}`);
      assert.ok(projected.z>-1&&projected.z<1,`${slug}: outside camera clipping planes`);
    }
  }
}
console.log('Four circuit overviews fit desktop and portrait views above the exploration controls.');
