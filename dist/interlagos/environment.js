import { TRACK_POINTS } from './track-data.js';

// Interlagos sits in a green urban bowl. Repeated structures are instanced;
// every grandstand footprint and tree is checked against the centreline.
// Grandstand A runs along the pit straight and M looks down on the Senna S.
// https://www.formula1.com/en/information/brazil-autodromo-jose-carlos-pace-sao-paulo.5z2RfrmiTTfEP6Wnxv1yIW

export function addInterlagosEnvironment(THREE, scene, curve, frames, landmarks, options = {}) {
  const { halfWidth = 6.5, sourceFractions = [] } = options;
  const group = new THREE.Group();
  group.name = 'Interlagos grandstands, city and green infield';
  scene.add(group);
  const up = new THREE.Vector3(0, 1, 0);
  const helper = new THREE.Object3D();
  const samples = frames.filter((_, index) => index % 6 === 0).map(frame => frame.point);
  const minRoadY = Math.min(...frames.map(frame => frame.point.y));
  const outerGroundY = minRoadY - 5.0;
  const lapMetres = 4309;
  const turnU = n => sourceFractions[landmarks.turns[`T${n}`].index];

  const concrete = new THREE.MeshStandardMaterial({ color: 0x92989a, roughness: .93 });
  const paleConcrete = new THREE.MeshStandardMaterial({ color: 0xc6c7be, roughness: .9 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x293a3c, metalness: .28, roughness: .58 });
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0xd8d6cc, metalness: .13, roughness: .75 });
  const seatMaterial = new THREE.MeshStandardMaterial({ color: 0x7f9293, roughness: .83 });
  const fanMaterial = new THREE.MeshStandardMaterial({ color: 0xddddca, roughness: .92 });
  // Instance colours carry the foliage variation. A pale base avoids the
  // nearly black multiply result of dark vertex colour × dark material.
  const treeLeaf = new THREE.MeshStandardMaterial({ color: 0xd6e4cb, roughness: 1 });
  const treeTrunk = new THREE.MeshStandardMaterial({ color: 0x554f3b, roughness: 1 });

  let seed = 0x5a0fa10;
  const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
  const smooth = t => { const v = Math.max(0, Math.min(1, t)); return v*v*(3-2*v); };
  const frameAt = u => {
    const wrapped = ((u % 1) + 1) % 1;
    const point = curve.getPointAt(wrapped);
    const forward = curve.getTangentAt(wrapped).setY(0).normalize();
    const across = new THREE.Vector3(forward.z, 0, -forward.x);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(across, up, forward));
    return { point, forward, across, quaternion };
  };
  const distanceToRoad = (x, z) => {
    let best = Infinity, nearestY = outerGroundY;
    for (const point of samples) {
      const distance = Math.hypot(x - point.x, z - point.z);
      if (distance < best) { best = distance; nearestY = point.y; }
    }
    return { distance: best, nearestY };
  };
  const groundAt = (x, z) => {
    const { distance, nearestY } = distanceToRoad(x, z);
    const bank = nearestY - 1.08 - Math.min(8, Math.max(0, distance - 14) * .039);
    return bank * (1 - smooth((distance - 14) / 270))
      + outerGroundY * smooth((distance - 14) / 270);
  };
  const infieldAt = (x, z) => {
    let inside = false;
    for (let i = 0, j = TRACK_POINTS.length - 2; i < TRACK_POINTS.length - 1; j = i++) {
      const a = TRACK_POINTS[i], b = TRACK_POINTS[j];
      if ((a[1] > z) !== (b[1] > z)
        && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  };

  function makeStand(name, station, sign, length, depth, roofed, rows = 12) {
    let site = null;
    for (const offset of [42, 54, 68, 82]) {
      const frame = frameAt(station);
      const position = frame.point.clone().addScaledVector(frame.across, sign * offset);
      const sampleOffsets = [0, sign * depth * .5, sign * depth];
      const sampleAlong = [-length * .52, 0, length * .52];
      const safe = sampleOffsets.every(lateral => sampleAlong.every(along => {
        const x = position.x + frame.across.x * lateral + frame.forward.x * along;
        const z = position.z + frame.across.z * lateral + frame.forward.z * along;
        return distanceToRoad(x, z).distance > halfWidth + 12;
      }));
      if (safe) { site = { frame, position }; break; }
    }
    if (!site) return null;
    const { frame, position } = site;
    const stand = new THREE.Group();
    stand.name = name;
    stand.position.set(position.x, groundAt(position.x, position.z) + .3, position.z);
    stand.quaternion.copy(frame.quaternion);
    group.add(stand);
    const stepDepth = depth / rows;
    const bench = new THREE.InstancedMesh(
      new THREE.BoxGeometry(stepDepth * .96, .46, length), seatMaterial, rows);
    bench.name = `${name} seating terraces`;
    for (let row = 0; row < rows; row++) {
      helper.position.set(sign * (row + .5) * stepDepth,
        2.0 + row * .63, 0);
      helper.quaternion.identity();
      helper.scale.set(1, 1, 1);
      helper.updateMatrix();
      bench.setMatrixAt(row, helper.matrix);
      bench.setColorAt(row, new THREE.Color(
        row % 5 === 0 ? 0xc3c8c3 : row % 3 === 0 ? 0x899d98 : 0x7c9190));
    }
    bench.instanceMatrix.needsUpdate = true;
    bench.instanceColor.needsUpdate = true;
    bench.receiveShadow = true;
    stand.add(bench);

    const base = new THREE.Mesh(new THREE.BoxGeometry(depth + 1, 1.5, length + 1.8), concrete);
    base.position.set(sign * depth / 2, .45, 0);
    base.receiveShadow = true;
    stand.add(base);
    const feetCount = Math.max(4, Math.round(length / 23));
    const feet = new THREE.InstancedMesh(new THREE.BoxGeometry(.9, 6.4, .9),
      paleConcrete, feetCount * 2);
    feet.name = `${name} visible support legs`;
    let foot = 0;
    for (let i = 0; i < feetCount; i++) for (const rail of [0, 1]) {
      helper.position.set(sign * (rail ? depth - 1.2 : 1.2), 3.15,
        -length/2 + i * length/(feetCount - 1));
      helper.quaternion.identity(); helper.scale.set(1,1,1); helper.updateMatrix();
      feet.setMatrixAt(foot++, helper.matrix);
    }
    feet.instanceMatrix.needsUpdate = true;
    stand.add(feet);

    const crowdCount = Math.max(160, Math.round(length * rows * .23));
    const spectators = new THREE.InstancedMesh(new THREE.SphereGeometry(.25, 5, 4),
      fanMaterial, crowdCount);
    spectators.name = `${name} spectator crowd`;
    const colors = [0xf0d65c, 0x0d8b64, 0xeee9d8, 0x2362a5, 0xc63b37, 0x35444a];
    for (let i = 0; i < crowdCount; i++) {
      const row = Math.floor(random() * rows);
      helper.position.set(sign * (row + .5) * stepDepth,
        2.6 + row * .63, (random()-.5) * (length - 3));
      helper.quaternion.identity(); helper.scale.set(1, 1.3, 1);
      helper.updateMatrix(); spectators.setMatrixAt(i, helper.matrix);
      spectators.setColorAt(i, new THREE.Color(colors[Math.floor(random()*colors.length)]));
    }
    spectators.instanceMatrix.needsUpdate = true;
    spectators.instanceColor.needsUpdate = true;
    stand.add(spectators);

    if (roofed) {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(depth + 6, .55, length + 5), roofMaterial);
      roof.name = `${name} canopy`;
      roof.position.set(sign * (depth/2 + 1), 5.0 + rows * .63, 0);
      roof.rotation.z = -sign * .055;
      roof.castShadow = true;
      stand.add(roof);
      const roofColumns = new THREE.InstancedMesh(new THREE.BoxGeometry(.47, 10, .47),
        darkSteel, feetCount);
      for (let i = 0; i < feetCount; i++) {
        helper.position.set(sign*(depth-1.6), 5.0,
          -length/2 + i*length/(feetCount-1));
        helper.quaternion.identity(); helper.scale.set(1,1,1); helper.updateMatrix();
        roofColumns.setMatrixAt(i, helper.matrix);
      }
      roofColumns.instanceMatrix.needsUpdate = true;
      stand.add(roofColumns);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(.12, 1.3, length+1), darkSteel);
    rail.position.set(-sign * 1.5, 2.05, 0);
    stand.add(rail);
    return stand;
  }

  const stands = [
    makeStand('Arquibancada A · reta principal', .982, 1, 154, 35, true, 14),
    makeStand('Arquibancada A · extensão', .025, 1, 118, 31, true, 12),
    makeStand('Arquibancada M · Senna S', turnU(1) + .013, 1, 100, 31, true, 12),
    makeStand('Arquibancada B · Curva do Sol', turnU(3) + .018, 1, 108, 29, false, 11),
    makeStand('Arquibancada G · Reta Oposta', turnU(4) - .07, 1, 146, 32, true, 12),
    makeStand('Arquibancada H · Descida do Lago', turnU(4) + .014, 1, 102, 28, false, 11),
    makeStand('Arquibancada N · Bico de Pato', turnU(10) - .018, 1, 92, 27, false, 10),
    makeStand('Arquibancada Junção', turnU(12) + .01, 1, 103, 28, false, 11),
  ].filter(Boolean);

  // Concrete paddock annexes sit behind the garages, clear of the racing line.
  const annexMaterial = new THREE.MeshStandardMaterial({ color: 0xb2b8b7,
    roughness: .83, metalness: .08 });
  for (const [u, offset, width, length, height] of [
    [.955, -80, 24, 100, 8], [.017, -86, 24, 105, 7], [.04, -92, 20, 72, 5],
  ]) {
    const frame = frameAt(u);
    const x = frame.point.x + frame.across.x * offset;
    const z = frame.point.z + frame.across.z * offset;
    if (distanceToRoad(x,z).distance < halfWidth + 24) continue;
    const annex = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), annexMaterial);
    annex.name = 'Interlagos paddock service annex';
    annex.position.set(x, groundAt(x,z) + height/2, z);
    annex.quaternion.copy(frame.quaternion);
    annex.castShadow = false; annex.receiveShadow = true;
    group.add(annex);
  }

  // Urban backdrop: restrained light-concrete blocks with a single tiled
  // facade texture. Their positions are far enough to clear the entire lap.
  const cityCanvas = document.createElement('canvas');
  cityCanvas.width = cityCanvas.height = 128;
  const ctx = cityCanvas.getContext('2d');
  ctx.fillStyle = '#8e9896'; ctx.fillRect(0,0,128,128);
  for (let y=7; y<128; y+=16) for (let x=6; x<128; x+=16) {
    ctx.fillStyle = (x+y)%3 === 0 ? '#748c96' : '#b9c4ba';
    ctx.fillRect(x,y,9,9);
    ctx.fillStyle = '#515d5d'; ctx.fillRect(x+1,y+8,8,1);
  }
  const cityMap = new THREE.CanvasTexture(cityCanvas);
  cityMap.colorSpace = THREE.SRGBColorSpace;
  const cityMaterial = new THREE.MeshStandardMaterial({ map:cityMap,
    color:0xe3e0d3, roughness:.9 });
  const buildingCount = 860;
  const city = new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1), cityMaterial, buildingCount);
  city.name = 'São Paulo mid-rise city silhouette';
  const roofMaterialCity = new THREE.MeshStandardMaterial({ color: 0x87918d,
    roughness: .94 });
  const cityRoofs = new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),
    roofMaterialCity, buildingCount);
  cityRoofs.name = 'São Paulo rooflines';
  let placedBuildings = 0;
  for (let tries=0; placedBuildings<buildingCount && tries<buildingCount*20; tries++) {
    const frame = frameAt(random());
    const side = random() < .5 ? -1 : 1;
    const radius = 145 + Math.pow(random(), .72) * 300;
    const x = frame.point.x + frame.across.x * side * radius;
    const z = frame.point.z + frame.across.z * side * radius;
    // A broad green buffer remains between the circuit and neighbourhood.
    if (infieldAt(x,z) || distanceToRoad(x,z).distance < 125) continue;
    const tower = random() < .045;
    const h = tower ? 48 + random()*34 : 9 + Math.pow(random(), .7) * 33;
    const width = 10 + random()*16;
    const length = 11 + random()*19;
    helper.position.set(x, groundAt(x,z)+h/2, z);
    helper.quaternion.setFromAxisAngle(up,(random()-.5)*.3);
    helper.scale.set(width,h,length);
    helper.updateMatrix(); city.setMatrixAt(placedBuildings,helper.matrix);
    city.setColorAt(placedBuildings,new THREE.Color().setHSL(.12+random()*.06,.025,.71+random()*.17));
    helper.position.y = groundAt(x,z)+h+ .35;
    helper.scale.set(width + .9, .75, length + .9);
    helper.updateMatrix(); cityRoofs.setMatrixAt(placedBuildings,helper.matrix);
    cityRoofs.setColorAt(placedBuildings,new THREE.Color().setHSL(.12,.025,.48+random()*.17));
    placedBuildings++;
  }
  city.count = cityRoofs.count = placedBuildings;
  city.instanceMatrix.needsUpdate = true;
  city.instanceColor.needsUpdate = true;
  cityRoofs.instanceMatrix.needsUpdate = true;
  cityRoofs.instanceColor.needsUpdate = true;
  city.frustumCulled = cityRoofs.frustumCulled = false;
  group.add(city,cityRoofs);

  // Dark evergreen clusters and subtropical crowns frame the bowl. All
  // tree positions have at least 35 m clear of the asphalt edge.
  const treeCount = 1200;
  const crowns = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), treeLeaf, treeCount);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.32,.46,1,5), treeTrunk, treeCount);
  crowns.name = 'Interlagos tree crowns'; trunks.name = 'Interlagos tree trunks';
  let planted = 0;
  for (let tries=0; planted<treeCount && tries<treeCount*40; tries++) {
    const frame = frameAt(random());
    const side = random() < .5 ? -1 : 1;
    const radius = 32 + Math.pow(random(), 1.35)*245;
    const x = frame.point.x + frame.across.x*side*radius;
    const z = frame.point.z + frame.across.z*side*radius;
    const {distance} = distanceToRoad(x,z);
    if (distance < halfWidth + 27 || distance > 280) continue;
    const g = groundAt(x,z);
    const height = 8 + random()*8;
    helper.position.set(x,g+height*.61,z);
    helper.quaternion.identity(); helper.scale.set(height*.37,height*.43,height*.37);
    helper.updateMatrix(); crowns.setMatrixAt(planted,helper.matrix);
    crowns.setColorAt(planted,new THREE.Color().setHSL(.27+random()*.075,.32+random()*.15,.35+random()*.10));
    helper.position.set(x,g+height*.26,z);
    helper.scale.set(1,height*.52,1); helper.updateMatrix();
    trunks.setMatrixAt(planted,helper.matrix);
    planted++;
  }
  crowns.count = trunks.count = planted;
  crowns.instanceMatrix.needsUpdate = trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceColor.needsUpdate = true;
  crowns.frustumCulled = trunks.frustumCulled = false;
  group.add(crowns,trunks);

  // A few Brazilian flags by the principal grandstand, on the spectator side.
  const flagCanvas = document.createElement('canvas');
  flagCanvas.width=128; flagCanvas.height=80;
  const flag=flagCanvas.getContext('2d');
  flag.fillStyle='#008b4b'; flag.fillRect(0,0,128,80);
  flag.fillStyle='#f5d327'; flag.beginPath();
  flag.moveTo(64,7); flag.lineTo(119,40); flag.lineTo(64,73); flag.lineTo(9,40);
  flag.closePath(); flag.fill();
  flag.fillStyle='#214da2'; flag.beginPath(); flag.arc(64,40,17,0,Math.PI*2); flag.fill();
  const flagTexture = new THREE.CanvasTexture(flagCanvas);
  flagTexture.colorSpace=THREE.SRGBColorSpace;
  const flagMaterial = new THREE.MeshBasicMaterial({ map:flagTexture, side:THREE.DoubleSide });
  for (let i=0; i<7; i++) {
    const frame = frameAt(.95+i*.011);
    const x=frame.point.x+frame.across.x*79;
    const z=frame.point.z+frame.across.z*79;
    if (distanceToRoad(x,z).distance < halfWidth+30) continue;
    const g=groundAt(x,z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.08,.11,11,6),darkSteel);
    pole.position.set(x,g+5.5,z);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(3.3,2.1),flagMaterial);
    cloth.position.set(x+1.65,g+9.4,z);
    cloth.rotation.y=i*.25;
    group.add(pole,cloth);
  }

  return { group, grandstandCount: stands.length, treeCount: planted,
    buildingCount: placedBuildings,
    landmarkStandNames: stands.map(stand => stand.name) };
}
