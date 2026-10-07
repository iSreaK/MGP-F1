/** Cool desert night sky with the warm light dome of Las Vegas below it. */
export function createVegasSky(THREE, scene) {
  function makeTexture(wet) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const sky = ctx.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, wet ? '#080d19' : '#070b18');
    sky.addColorStop(.54, wet ? '#111c2a' : '#10203d');
    sky.addColorStop(.82, wet ? '#25313b' : '#28355a');
    sky.addColorStop(1, wet ? '#5b4b50' : '#765366');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1024, 512);
    let seed = 871923;
    const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
    if (!wet) for (let i = 0; i < 95; i++) {
      const x = random() * 1024, y = random() * 220;
      ctx.fillStyle = `rgba(208,226,255,${.24 + random() * .35})`;
      ctx.fillRect(x, y, random() > .93 ? 2 : 1, 1);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    return texture;
  }
  const dry = makeTexture(false), rainy = makeTexture(true);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(6100, 32, 18),
    new THREE.MeshBasicMaterial({ map: dry, side: THREE.BackSide,
      fog: false, depthWrite: false, toneMapped: false }));
  dome.name = 'Las Vegas desert night sky';
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  scene.add(dome);
  return {
    dome,
    setWet(wet) { dome.material.map = wet ? rainy : dry; dome.material.needsUpdate = true; },
    follow(position) { dome.position.copy(position); },
  };
}
