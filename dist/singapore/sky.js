/** A restrained, light-polluted night sky for Marina Bay. */
export function createSingaporeSky(THREE, scene) {
  const width = 768;
  const height = 384;
  const paint = wet => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, wet ? '#040a16' : '#071525');
    gradient.addColorStop(.48, wet ? '#0a1722' : '#10293d');
    gradient.addColorStop(.57, wet ? '#152331' : '#1a3545');
    gradient.addColorStop(1, wet ? '#0b1822' : '#142635');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    // Humid low clouds and the diffuse glow of a dense city, not a star field.
    const glow = context.createRadialGradient(width * .64, height * .54, 3,
      width * .64, height * .54, width * .45);
    glow.addColorStop(0, wet ? 'rgba(66,83,105,.18)' : 'rgba(136,168,171,.20)');
    glow.addColorStop(1, 'rgba(26,47,66,0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);
    let seed = 2847;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 46; i++) {
      const x = random() * width;
      const y = height * (.3 + random() * .31);
      const rx = 28 + random() * 90;
      const ry = 2 + random() * 9;
      context.save();
      context.translate(x, y);
      context.scale(1, ry / rx);
      const cloud = context.createRadialGradient(0, 0, 1, 0, 0, rx);
      cloud.addColorStop(0, wet ? 'rgba(148,168,182,.075)' : 'rgba(137,164,175,.055)');
      cloud.addColorStop(1, 'rgba(90,119,140,0)');
      context.fillStyle = cloud;
      context.fillRect(-rx, -rx, rx * 2, rx * 2);
      context.restore();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    return texture;
  };
  const dry = paint(false);
  const rain = paint(true);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(7800, 32, 18),
    new THREE.MeshBasicMaterial({ map: dry, side: THREE.BackSide, fog: false,
      depthWrite: false, toneMapped: false }));
  dome.name = 'Marina Bay night sky';
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  scene.add(dome);
  return {
    dome,
    setWet(wet) { dome.material.map = wet ? rain : dry; dome.material.needsUpdate = true; },
    follow(position) { dome.position.copy(position); },
  };
}
