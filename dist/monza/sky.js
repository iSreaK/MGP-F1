/** A lightweight panoramic sky, generated once and kept centred on the camera. */
export function createMonzaSky(THREE, scene) {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const image = context.createImageData(width, height);

  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = (low, high, value) => {
    const t = clamp((value - low) / (high - low));
    return t * t * (3 - 2 * t);
  };
  const hash = (x, y) => {
    let value = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  };
  const noise = (x, y, period) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = smooth(0, 1, x - ix);
    const fy = smooth(0, 1, y - iy);
    const h = (ox, oy) => hash(((ix + ox) % period + period) % period, iy + oy);
    const a = h(0, 0) * (1 - fx) + h(1, 0) * fx;
    const b = h(0, 1) * (1 - fx) + h(1, 1) * fx;
    return a * (1 - fy) + b * fy;
  };
  const cloudNoise = (x, y) => {
    let result = 0;
    for (const [period, weight] of [[7, .50], [14, .28], [28, .15], [56, .07]]) {
      result += noise(x / width * period, y / height * period * .78, period) * weight;
    }
    return result;
  };

  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    const high = smooth(.10, .51, .51 - v);
    const sky = [
      198 - 111 * high,
      217 - 57 * high,
      226 - 22 * high,
    ];
    // The lower hemisphere is hidden by the park, but the continuous pale
    // colour avoids a hard horizon when viewed from the helicopter camera.
    if (v > .5) {
      const below = smooth(.50, .88, v);
      sky[0] = 198 - 32 * below;
      sky[1] = 217 - 38 * below;
      sky[2] = 226 - 43 * below;
    }
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      let r = sky[0], g = sky[1], b = sky[2];
      if (v < .61) {
        const warp = 14 * Math.sin(v * 24 + x / width * Math.PI * 4);
        const n = cloudNoise(x + warp, y);
        // Trackside cameras only see a narrow strip above the tree line;
        // the soft cumulus below are placed there explicitly.
        const highCloud = smooth(.50, .62, n)
          * smooth(.29, .35, v)
          * (1 - smooth(.50, .58, v));
        const coverage = highCloud;
        const shade = 1 - .12 * smooth(.28, .46, v);
        const brightness = (232 + 18 * noise(x / width * 56, v * 44, 56)) * shade;
        r += (brightness - r) * coverage;
        g += (brightness + 3 - g) * coverage;
        b += (brightness + 5 - b) * coverage;
        // Low, thin haze ties the cumulus to the distant tree line.
        const haze = smooth(.38, .5, v) * .24;
        r += (215 - r) * haze;
        g += (226 - g) * haze;
        b += (230 - b) * haze;
      }
      image.data[p] = r;
      image.data[p + 1] = g;
      image.data[p + 2] = b;
      image.data[p + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  // Distinct soft cumulus make the narrow sky band above the grandstands
  // legible from the grid. Draw wrapped copies so the panorama has no seam.
  const softEllipse = (x, y, rx, ry, alpha, colour = '255,255,255') => {
    for (const shift of [-width, 0, width]) {
      context.save();
      context.translate(x + shift, y);
      context.scale(1, ry / rx);
      const fill = context.createRadialGradient(0, 0, rx * .15, 0, 0, rx);
      fill.addColorStop(0, `rgba(${colour},${alpha})`);
      fill.addColorStop(.58, `rgba(${colour},${alpha * .88})`);
      fill.addColorStop(1, `rgba(${colour},0)`);
      context.fillStyle = fill;
      context.fillRect(-rx, -rx, rx * 2, rx * 2);
      context.restore();
    }
  };
  for (const [x, y, scale] of [
    [78, 85, .72], [190, 106, .7], [333, 74, .95], [501, 100, .75],
    [638, 75, 1.05], [799, 104, .8], [929, 87, .58],
  ]) {
    softEllipse(x, y + 13 * scale, 56 * scale, 15 * scale, .28, '178,192,200');
    softEllipse(x - 18 * scale, y + 2 * scale, 36 * scale, 18 * scale, .9);
    softEllipse(x + 17 * scale, y - 8 * scale, 36 * scale, 23 * scale, .95);
    softEllipse(x + 48 * scale, y + 5 * scale, 27 * scale, 15 * scale, .73);
  }
  const rainCanvas = document.createElement('canvas');
  rainCanvas.width = width;
  rainCanvas.height = height;
  const rainContext = rainCanvas.getContext('2d');
  rainContext.drawImage(canvas, 0, 0);
  const rainImage = rainContext.getImageData(0, 0, width, height);
  for (let p = 0; p < rainImage.data.length; p += 4) {
    const light = rainImage.data[p] * .23 + rainImage.data[p + 1] * .64 + rainImage.data[p + 2] * .13;
    const grey = Math.max(75, Math.min(180, 117 + (light - 165) * .68));
    rainImage.data[p] = grey * .88;
    rainImage.data[p + 1] = grey * .96;
    rainImage.data[p + 2] = grey * 1.04;
  }
  rainContext.putImageData(rainImage, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.offset.y = .34;
  texture.anisotropy = 4;
  const rainTexture = new THREE.CanvasTexture(rainCanvas);
  rainTexture.colorSpace = THREE.SRGBColorSpace;
  rainTexture.wrapS = THREE.RepeatWrapping;
  rainTexture.offset.y = texture.offset.y;
  rainTexture.anisotropy = 4;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(5100, 48, 32),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false }),
  );
  dome.name = 'Monza summer sky and cloud layers';
  dome.rotation.y = Math.PI / 2;
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  scene.add(dome);
  return {
    dome, texture, rainTexture,
    setWet(wet) { dome.material.map = wet ? rainTexture : texture; dome.material.needsUpdate = true; },
    follow(position) { dome.position.copy(position); },
  };
}
