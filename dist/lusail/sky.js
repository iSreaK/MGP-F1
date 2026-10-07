/** Night sky over Lusail: dark indigo zenith, a muted amber Doha-facing glow. */
export function createLusailSky(THREE, scene) {
  function paint(wet) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, wet ? '#090e1b' : '#050918');
    gradient.addColorStop(.54, wet ? '#182437' : '#111f36');
    gradient.addColorStop(.76, wet ? '#344252' : '#29394a');
    gradient.addColorStop(1, wet ? '#665d5d' : '#5e5149');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1024, 512);
    const glow = ctx.createRadialGradient(775, 365, 4, 775, 365, 270);
    glow.addColorStop(0, wet ? 'rgba(181,143,105,.20)' : 'rgba(238,165,102,.27)');
    glow.addColorStop(1, 'rgba(238,165,102,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, 1024, 512);
    if (!wet) {
      let seed = 0x51a1;
      const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
      for (let i = 0; i < 120; i++) {
        const x = random() * 1024, y = random() * 280;
        const radius = .28 + random() * .7;
        ctx.fillStyle = `rgba(230,236,242,${(.16 + random() * .3).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
      }
    }
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    return map;
  }
  const dry = paint(false), rainy = paint(true);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(6000, 32, 16),
    new THREE.MeshBasicMaterial({ map: dry, side: THREE.BackSide, fog: false,
      depthWrite: false, toneMapped: false }));
  dome.name = 'Lusail night sky';
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  scene.add(dome);
  return {
    dome,
    setWet(wet) { dome.material.map = wet ? rainy : dry; dome.material.needsUpdate = true; },
    follow(position) { dome.position.copy(position); },
  };
}
