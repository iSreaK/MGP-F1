/** Soft November daylight over the open Autódromo José Carlos Pace landscape. */
export function createInterlagosSky(THREE, scene) {
  function paint(rain) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    const gradient = context.createLinearGradient(0, 0, 0, 512);
    if (rain) {
      gradient.addColorStop(0, '#586a77');
      gradient.addColorStop(.55, '#899aa4');
      gradient.addColorStop(1, '#c0c8c6');
    } else {
      gradient.addColorStop(0, '#2879bb');
      gradient.addColorStop(.48, '#8dbed9');
      gradient.addColorStop(.72, '#d0dbd3');
      gradient.addColorStop(1, '#e8d9bc');
    }
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1024, 512);
    const horizon = context.createLinearGradient(0, 240, 0, 458);
    horizon.addColorStop(0, 'rgba(255,255,255,0)');
    horizon.addColorStop(.52, rain ? 'rgba(231,237,234,.11)' : 'rgba(255,233,188,.24)');
    horizon.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = horizon;
    context.fillRect(0, 0, 1024, 512);
    let seed = 4812;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < (rain ? 35 : 20); i++) {
      const x = random() * 1024;
      const y = 175 + random() * 170;
      const radius = 38 + random() * 90;
      const flatten = .12 + random() * .1;
      for (const wrap of [-1024, 0, 1024]) {
        context.save();
        context.translate(x + wrap, y);
        context.scale(1, flatten);
        const cloud = context.createRadialGradient(0, 0, 2, 0, 0, radius);
        cloud.addColorStop(0, rain ? 'rgba(242,243,239,.32)' : 'rgba(255,255,251,.31)');
        cloud.addColorStop(1, 'rgba(255,255,255,0)');
        context.fillStyle = cloud;
        context.fillRect(-radius, -radius, radius * 2, radius * 2);
        context.restore();
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    return texture;
  }
  const dry = paint(false), wet = paint(true);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(6000, 32, 18),
    new THREE.MeshBasicMaterial({ map: dry, side: THREE.BackSide, fog: false,
      depthWrite: false, toneMapped: false }));
  dome.name = 'INTERLAGOS daylight sky';
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  scene.add(dome);
  return {
    dome,
    setWet(rain) { dome.material.map = rain ? wet : dry; dome.material.needsUpdate = true; },
    follow(position) { dome.position.copy(position); },
  };
}
