import { TRACK_POINTS } from './track-data.js';

// Interlagos sits in a green urban bowl. Repeated structures are instanced;
// every grandstand footprint and tree is checked against the centreline.
// The promoter's sector map fixes each grandstand relative to the named turns.
// https://www.formula1.com/en/information/brazil-autodromo-jose-carlos-pace-sao-paulo.5z2RfrmiTTfEP6Wnxv1yIW

export function addInterlagosEnvironment(THREE, scene, curve, frames, landmarks, options = {}) {
  const { halfWidth = 6.5, sourceFractions = [], terrainHeightAt } = options;
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
  // Props must sample the same triangulated terrain the camera sees. The old
  // nearest-road approximation buried tree trunks and left stand legs floating
  // on São Paulo's sloping ground.
  const groundAt = (x, z) => typeof terrainHeightAt === 'function'
    ? terrainHeightAt(x, z, outerGroundY)
    : outerGroundY;
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
      if (safe) { site = { frame, position, offset }; break; }
    }
    if (!site) return null;
    const { frame, position, offset } = site;
    const stand = new THREE.Group();
    stand.name = name;
    stand.position.set(position.x, groundAt(position.x, position.z) + .3, position.z);
    stand.quaternion.copy(frame.quaternion);
    stand.userData = {
      sector: name, station, side: sign, offset, length, depth, roofed,
      facesTrack: true, trackPoint: frame.point.toArray(),
    };
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
    // Three lines of posts carry each raked terrace. Their bottoms sample
    // the real terrain, so the 43 m venue relief never leaves a stand floating.
    const feetCount = Math.max(5, Math.round(length / 18));
    const feet = new THREE.InstancedMesh(new THREE.BoxGeometry(.9, 1, .9),
      paleConcrete, feetCount * 3);
    feet.name = name + ' visible support legs';
    let foot = 0;
    for (let i = 0; i < feetCount; i++) for (const rail of [0, .5, 1]) {
      const along = -length/2 + i * length/(feetCount - 1);
      const lateral = sign * (1.2 + rail * (depth - 2.4));
      const worldX = position.x + frame.across.x * lateral + frame.forward.x * along;
      const worldZ = position.z + frame.across.z * lateral + frame.forward.z * along;
      const groundY = groundAt(worldX, worldZ) - stand.position.y;
      const deckY = 2.15 + rail * (rows - 1) * .63;
      const height = Math.max(.75, deckY - groundY);
      helper.position.set(lateral, groundY + height/2, along);
      helper.quaternion.identity(); helper.scale.set(1,height,1); helper.updateMatrix();
      feet.setMatrixAt(foot++, helper.matrix);
    }
    feet.instanceMatrix.needsUpdate = true;
    stand.add(feet);
    const rise = (rows - 1) * .63;
    const rake = new THREE.InstancedMesh(
      new THREE.BoxGeometry(Math.hypot(depth, rise), .55, .58),
      darkSteel, feetCount);
    rake.name = name + ' sloping underseat beams';
    for (let i=0; i<feetCount; i++) {
      helper.position.set(sign*depth/2, 2.0 + rise/2,
        -length/2 + i*length/(feetCount-1));
      helper.quaternion.setFromAxisAngle(new THREE.Vector3(0,0,1),
        sign*Math.atan2(rise,depth));
      helper.scale.set(1,1,1); helper.updateMatrix();
      rake.setMatrixAt(i,helper.matrix);
    }
    rake.instanceMatrix.needsUpdate=true;
    stand.add(rake);
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
      const roofColumns = new THREE.InstancedMesh(new THREE.BoxGeometry(.47, 1, .47),
        darkSteel, feetCount);
      roofColumns.name = name + ' canopy support columns';
      for (let i = 0; i < feetCount; i++) {
        const along = -length/2 + i*length/(feetCount-1);
        const lateral = sign*(depth-1.6);
        const worldX = position.x + frame.across.x*lateral + frame.forward.x*along;
        const worldZ = position.z + frame.across.z*lateral + frame.forward.z*along;
        const groundY = groundAt(worldX,worldZ) - stand.position.y;
        const canopyY = 4.7 + rows*.63;
        const height = Math.max(1,canopyY-groundY);
        helper.position.set(lateral,groundY+height/2,along);
        helper.quaternion.identity(); helper.scale.set(1,height,1); helper.updateMatrix();
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

  // The promoter's sector guide is more precise than a generic fan guide:
  // A is uncovered on the banked final approach; B faces the starting grid;
  // M faces the pits; D overlooks Senna S; H sits between S and Sol;
  // R follows Curva do Sol; G is at the end of Reta Oposta.
  // https://f1saopaulo.com.br/en/stands/
  const stands = [
    makeStand('Arquibancada A · subida final', .867, 1, 128, 34, false, 15),
    makeStand('Arquibancada A · entrada dos boxes', .914, 1, 126, 32, false, 14),
    makeStand('Arquibancada B · grid', .983, 1, 92, 29, true, 13),
    makeStand('Arquibancada M · boxes', .042, 1, 92, 30, true, 13),
    makeStand('Arquibancada D · S do Senna', turnU(1) + .015, 1, 85, 28, true, 12),
    makeStand('Arquibancada H · S e Sol', turnU(2) + .025, 1, 88, 28, true, 11),
    makeStand('Arquibancada R · Curva do Sol', turnU(3) + .012, 1, 102, 28, true, 11),
    makeStand('Arquibancada G · fim da Reta Oposta', turnU(4) - .034, 1, 158, 32, false, 13),
    makeStand('Orange Tree Club · Laranjinha', turnU(7) + .010, -1, 76, 25, true, 9),
    makeStand('Grand Prix Club · Pinheirinho', turnU(9), -1, 66, 21, true, 8),
  ].filter(Boolean);

  // Concrete paddock annexes sit behind the garages, clear of the racing line.
  const structureFootprints = [];
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
    structureFootprints.push({ x, z, frame, width, length });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(width + .7, .24, length + .7),
      roofMaterial);
    roof.name = 'Interlagos paddock annex roof';
    roof.position.set(x, annex.position.y + height/2 + .1, z);
    roof.quaternion.copy(frame.quaternion);
    roof.receiveShadow = true;
    group.add(roof);
    for (const side of [-1, 1]) {
      const ribbon = new THREE.Mesh(new THREE.BoxGeometry(.18, 1.1, length + .12),
        darkSteel);
      ribbon.name = 'Interlagos paddock annex window belt';
      ribbon.position.set(x + frame.across.x * side * (width/2 + .11),
        annex.position.y + height * .18,
        z + frame.across.z * side * (width/2 + .11));
      ribbon.quaternion.copy(frame.quaternion);
      group.add(ribbon);
    }
    if (u === .955) {
      // The media and operations level breaks the otherwise blank paddock
      // roofline visible from the starting grid.
      const level = new THREE.Group();
      level.name = 'Interlagos paddock media and operations level';
      level.position.set(x, annex.position.y + height/2 + .24, z);
      level.quaternion.copy(frame.quaternion);
      group.add(level);
      const glazing = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 34),
        new THREE.MeshStandardMaterial({ color: 0x557784, metalness: .26,
          roughness: .31, emissive: 0x152e38, emissiveIntensity: .35 }));
      glazing.name = 'Interlagos paddock upper glazing';
      glazing.position.y = 3.5;
      level.add(glazing);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(14, .48, 36), roofMaterial);
      cap.name = 'Interlagos paddock operations overhang';
      cap.position.y = 7.24;
      level.add(cap);
      const mullions = new THREE.InstancedMesh(
        new THREE.BoxGeometry(.18, 6.5, .22), darkSteel, 16);
      mullions.name = 'Interlagos paddock operations glazing mullions';
      let slot = 0;
      for (const side of [-1, 1]) for (let i = 0; i < 8; i++) {
        helper.position.set(side * 6.12, 3.5, -15 + i * 4.3);
        helper.quaternion.identity(); helper.scale.set(1,1,1);
        helper.updateMatrix();
        mullions.setMatrixAt(slot++, helper.matrix);
      }
      mullions.instanceMatrix.needsUpdate = true;
      level.add(mullions);
    }
  }

  // The infield contains service compounds and narrow access lanes. Small
  // terrain-following pads keep them seated in the bowl without flattening the
  // surveyed racing surface or inventing another large grandstand.
  const serviceRoad = new THREE.MeshStandardMaterial({ color: 0x666b66,
    roughness: .98, side: THREE.DoubleSide });
  const shedWall = new THREE.MeshStandardMaterial({ color: 0x929c91,
    roughness: .9 });
  const shedRoof = new THREE.MeshStandardMaterial({ color: 0xb7bdb2,
    metalness: .14, roughness: .76 });
  const serviceSites = [
    { u: .577, offset: -112, width: 32, length: 48, height: 6.4 },
    { u: .641, offset: -75, width: 28, length: 42, height: 5.2 },
    { u: .692, offset: -111, width: 30, length: 45, height: 5.8 },
    { u: .752, offset: -105, width: 27, length: 39, height: 4.9 },
  ];
  let infieldCompoundCount = 0;
  for (const site of serviceSites) {
    const frame = frameAt(site.u);
    const cx = frame.point.x + frame.across.x * site.offset;
    const cz = frame.point.z + frame.across.z * site.offset;
    const xz = (lateral, along) => ({
      x: cx + frame.across.x * lateral + frame.forward.x * along,
      z: cz + frame.across.z * lateral + frame.forward.z * along,
    });
    // Validate the full pad footprint against every part of the lap.
    const padWidth = site.width + 17, padLength = site.length + 20;
    const corners = [[-1,-1],[-1,1],[1,-1],[1,1],[0,0]];
    if (!corners.every(([sx,sz]) => {
      const p = xz(sx * padWidth/2, sz * padLength/2);
      return infieldAt(p.x,p.z) && distanceToRoad(p.x,p.z).distance > halfWidth + 31;
    })) continue;
    const subdivisionsX = 4, subdivisionsZ = 8;
    const positions = [], indices = [];
    for (let iz=0; iz<=subdivisionsZ; iz++) for (let ix=0; ix<=subdivisionsX; ix++) {
      const p = xz((ix/subdivisionsX-.5)*padWidth,
        (iz/subdivisionsZ-.5)*padLength);
      positions.push(p.x,groundAt(p.x,p.z)+.075,p.z);
      if (ix<subdivisionsX && iz<subdivisionsZ) {
        const a=iz*(subdivisionsX+1)+ix, b=a+subdivisionsX+1;
        indices.push(a,b,a+1,a+1,b,b+1);
      }
    }
    const padGeometry = new THREE.BufferGeometry();
    padGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    padGeometry.setIndex(indices); padGeometry.computeVertexNormals();
    const pad = new THREE.Mesh(padGeometry,serviceRoad);
    pad.name = 'Interlagos infield service access pad';
    pad.receiveShadow = true;
    group.add(pad);

    const height = site.height;
    const shed = new THREE.Mesh(new THREE.BoxGeometry(site.width,height,site.length),shedWall);
    shed.name = 'Interlagos infield maintenance building';
    shed.position.set(cx,groundAt(cx,cz)+height/2+.18,cz);
    shed.quaternion.copy(frame.quaternion);
    shed.receiveShadow = true;
    group.add(shed);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(site.width+1,.42,site.length+1),shedRoof);
    roof.name = 'Interlagos infield maintenance roof';
    roof.position.set(cx,shed.position.y+height/2+.18,cz);
    roof.quaternion.copy(frame.quaternion);
    roof.castShadow = true;
    group.add(roof);
    const shutter = new THREE.Mesh(new THREE.BoxGeometry(site.width*.62,height*.55,.14),darkSteel);
    shutter.name = 'Interlagos infield maintenance entrance';
    const door = xz(0,-site.length/2-.12);
    shutter.position.set(door.x,groundAt(door.x,door.z)+height*.28+.18,door.z);
    shutter.quaternion.copy(frame.quaternion);
    group.add(shutter);
    for (const along of [-.24, 0, .24]) {
      const p = xz(site.width*.18, along*site.length);
      const vent = new THREE.Mesh(new THREE.BoxGeometry(2.3,.85,3.4),darkSteel);
      vent.name = 'Interlagos infield maintenance roof vent';
      vent.position.set(p.x,roof.position.y+.65,p.z);
      vent.quaternion.copy(frame.quaternion);
      group.add(vent);
    }
    structureFootprints.push({ x:cx, z:cz, frame,
      width:site.width+17, length:site.length+20 });
    infieldCompoundCount++;
  }

  const nearStructure = (x,z,reserve=5) => structureFootprints.some(site => {
    const dx=x-site.x, dz=z-site.z;
    const lateral=dx*site.frame.across.x+dz*site.frame.across.z;
    const along=dx*site.frame.forward.x+dz*site.frame.forward.z;
    return Math.abs(lateral)<site.width/2+reserve
      && Math.abs(along)<site.length/2+reserve;
  });

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
  const buildingCount = 1360;
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
    const radius = 115 + Math.pow(random(), .72) * 260;
    const x = frame.point.x + frame.across.x * side * radius;
    const z = frame.point.z + frame.across.z * side * radius;
    // A broad green buffer remains between the circuit and neighbourhood.
    if (infieldAt(x,z) || distanceToRoad(x,z).distance < 125) continue;
    const tower = random() < .028;
    const h = tower ? 43 + random()*26 : 7 + Math.pow(random(), .84) * 21;
    const width = 10 + random()*16;
    const length = 11 + random()*19;
    helper.position.set(x, groundAt(x,z)+h/2, z);
    helper.quaternion.setFromAxisAngle(up,(random()-.5)*.3);
    helper.scale.set(width,h,length);
    helper.updateMatrix(); city.setMatrixAt(placedBuildings,helper.matrix);
    city.setColorAt(placedBuildings,new THREE.Color().setHSL(.07+random()*.11,.035+random()*.085,.66+random()*.20));
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

  // Interlagos is a green urban bowl. The municipality reports 1,703 trees
  // planted around the venue, including a sound buffer. Concentrate this
  // reconstruction into visible belts by Sector A, Senna S, and Reta Oposta
  // instead of scattering every crown beyond the race camera.
  // https://prefeitura.sp.gov.br/w/noticia/prefeitura-moderniza-pista-acessos-e-arquibancadas-do-autodromo-de-interlagos-para-o-gp-sao-paulo-de-formula-1
  const nearStand = (x, z, reserve = 7) => stands.some(stand => {
    const info = stand.userData;
    const frame = frameAt(info.station);
    const dx = x - stand.position.x, dz = z - stand.position.z;
    const along = dx*frame.forward.x + dz*frame.forward.z;
    const across = (dx*frame.across.x + dz*frame.across.z) * info.side;
    return Math.abs(along) < info.length/2 + reserve
      && across > -reserve && across < info.depth + reserve;
  });
  const forestBelts = [
    {from:.81,to:.94,side:1,near:84,far:160},
    {from:.08,to:.18,side:1,near:78,far:170},
    {from:.22,to:.34,side:1,near:58,far:155},
    {from:.35,to:.49,side:-1,near:52,far:152},
    {from:.51,to:.72,side:-1,near:58,far:175},
  ];
  const treeCount = 1700;
  const crowns = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6),
    treeLeaf, treeCount);
  const crownLobes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),
    treeLeaf, treeCount*2);
  const conifers = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7, 2),
    treeLeaf, treeCount);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.32,.46,1,5),
    treeTrunk, treeCount);
  crowns.name = 'Interlagos broadleaf tree crowns';
  crownLobes.name = 'Interlagos irregular broadleaf canopy lobes';
  conifers.name = 'Interlagos slender evergreen crowns';
  trunks.name = 'Interlagos tree trunks';
  let planted=0, broadCount=0, coniferCount=0, lobeCount=0;
  for (let tries=0; planted<treeCount && tries<treeCount*45; tries++) {
    const belt = random()<.70 ? forestBelts[Math.floor(random()*forestBelts.length)] : null;
    const u = belt ? belt.from+random()*(belt.to-belt.from) : random();
    const frame = frameAt(u);
    const side = belt ? belt.side : random()<.5 ? -1 : 1;
    const radius = belt ? belt.near+random()*(belt.far-belt.near)
      : 36+Math.pow(random(),1.4)*220;
    const x = frame.point.x+frame.across.x*side*radius;
    const z = frame.point.z+frame.across.z*side*radius;
    const distance = distanceToRoad(x,z).distance;
    if (distance<halfWidth+28 || distance>280 || nearStand(x,z,7) || nearStructure(x,z,7)) continue;
    const g=groundAt(x,z);
    const height=9.5+random()*10;
    const slender=random()<.08;
    if (slender) {
      helper.position.set(x,g+height*.64,z);
      helper.quaternion.identity();
      helper.scale.set(height*.22,height*.66,height*.22);
      helper.updateMatrix(); conifers.setMatrixAt(coniferCount,helper.matrix);
      conifers.setColorAt(coniferCount,new THREE.Color().setHSL(
        .27+random()*.045,.34+random()*.15,.31+random()*.10));
      coniferCount++;
    } else {
      helper.position.set(x,g+height*.62,z);
      helper.quaternion.identity();
      helper.scale.set(height*.29,height*.32,height*.30);
      helper.updateMatrix(); crowns.setMatrixAt(broadCount,helper.matrix);
      crowns.setColorAt(broadCount,new THREE.Color().setHSL(
        .24+random()*.095,.34+random()*.20,.34+random()*.15));
      broadCount++;
      // Uneven satellite crowns break the lollipop silhouette without
      // another mesh per tree. These share one GPU instanced draw call.
      for (const side of [-1,1]) {
        helper.position.set(x+side*height*.16,g+height*(.61+side*.035),
          z+side*height*.07);
        helper.quaternion.setFromAxisAngle(up,random()*Math.PI);
        helper.scale.set(height*.22,height*.24,height*.21);
        helper.updateMatrix();crownLobes.setMatrixAt(lobeCount,helper.matrix);
        crownLobes.setColorAt(lobeCount,new THREE.Color().setHSL(
          .25+random()*.085,.34+random()*.20,.29+random()*.13));
        lobeCount++;
      }
    }
    helper.position.set(x,g+height*.29,z);
    helper.quaternion.identity(); helper.scale.set(.8,height*.58,.8);
    helper.updateMatrix(); trunks.setMatrixAt(planted,helper.matrix);
    planted++;
  }
  crowns.count=broadCount; crownLobes.count=lobeCount;
  conifers.count=coniferCount; trunks.count=planted;
  for (const mesh of [crowns,crownLobes,conifers,trunks]) {
    mesh.instanceMatrix.needsUpdate=true;
    mesh.frustumCulled=false;
    group.add(mesh);
  }
  crowns.instanceColor.needsUpdate=true;
  crownLobes.instanceColor.needsUpdate=true;
  conifers.instanceColor.needsUpdate=true;

  // Low, irregular planting makes trackside slopes readable from the car
  // camera without hundreds of separate objects or draw calls.
  const shrubCount=900;
  const shrubs=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),
    new THREE.MeshStandardMaterial({color:0xb1c9a1,roughness:1}),shrubCount);
  shrubs.name='Interlagos trackside shrubs';
  let shrubbed=0;
  for(let tries=0;shrubbed<shrubCount&&tries<shrubCount*35;tries++){
    const frame=frameAt(random());
    const side=random()<.5?-1:1;
    const radius=halfWidth+29+random()*69;
    const x=frame.point.x+frame.across.x*side*radius;
    const z=frame.point.z+frame.across.z*side*radius;
    if(distanceToRoad(x,z).distance<halfWidth+24||nearStand(x,z,5)||nearStructure(x,z,4))continue;
    const h=1.6+random()*2.4;
    helper.position.set(x,groundAt(x,z)+h*.45,z);
    helper.quaternion.identity();helper.scale.set(h*.95,h*.55,h*.86);
    helper.updateMatrix();shrubs.setMatrixAt(shrubbed,helper.matrix);
    shrubs.setColorAt(shrubbed,new THREE.Color().setHSL(
      .27+random()*.09,.42+random()*.19,.25+random()*.11));
    shrubbed++;
  }
  shrubs.count=shrubbed;
  shrubs.instanceMatrix.needsUpdate=true;
  shrubs.instanceColor.needsUpdate=true;
  shrubs.frustumCulled=false;
  group.add(shrubs);
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
    buildingCount: placedBuildings, shrubCount: shrubbed,
    infieldCompoundCount,
    landmarkStandNames: stands.map(stand => stand.name) };
}
