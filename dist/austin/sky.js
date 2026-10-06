/** Soft October daylight over the open Circuit of The Americas landscape. */
export function createAustinSky(THREE, scene) {
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
      gradient.addColorStop(0, '#4d83bd');
      gradient.addColorStop(.48, '#9bbbd4');
      gradient.addColorStop(.72, '#d0dcd8');
      gradient.addColorStop(1, '#e2d6bd');
    }
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1024, 512);
    const horizon = context.createRadialGradient(750, 346, 18, 750, 346, 620);
    horizon.addColorStop(0, rain ? 'rgba(233,239,236,.14)' : 'rgba(255,235,191,.39)');
    horizon.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = horizon;
    context.fillRect(0, 0, 1024, 512);
    let seed = 4812;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < (rain ? 35 : 20); i++) {
      const x = random() * 1024;
      const y = 175 + random() * 170;
      const radius = 38 + random() * 90;
      context.save();
      context.translate(x, y);
      context.scale(1, .12 + random() * .1);
      const cloud = context.createRadialGradient(0, 0, 2, 0, 0, radius);
      cloud.addColorStop(0, rain ? 'rgba(242,243,239,.32)' : 'rgba(255,255,251,.39)');
      cloud.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = cloud;
      context.fillRect(-radius, -radius, radius * 2, radius * 2);
      context.restore();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    return texture;
  }
  const dry = paint(false), wet = paint(true);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(7900, 32, 18),
    new THREE.MeshBasicMaterial({ map: dry, side: THREE.BackSide, fog: false,
      depthWrite: false, toneMapped: false }));
  dome.name = 'COTA daylight sky';
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  scene.add(dome);
  return {
    dome,
    setWet(rain) { dome.material.map = rain ? wet : dry; dome.material.needsUpdate = true; },
    follow(position) { dome.position.copy(position); },
  };
}
