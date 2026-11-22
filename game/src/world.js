// Costa Alba — the city itself: procedural blocks, roads, beach, ocean, docks,
// airfield, plaza and landmarks. Everything is built from boxes, cylinders and
// canvas textures, so the whole world ships as plain files with no assets.
import * as THREE from 'three';
import { mulberry32, range, pick, canvasTexture, PALETTE } from './util.js';

export const GRID = 60;          // distance between road centre lines
export const ROAD_W = 12;        // road width
export const CITY_HALF = 330;    // playable city edge (roads run -300..300)
const WORLD = 900;               // ground plane size
const ROADS = [-300, -240, -180, -120, -60, 0, 60, 120, 180, 240, 300];

// Block (bx, bz) -> landmark id. Block centres sit at bx*60+30, bz*60+30.
const LANDMARK_BLOCKS = {
  '1,-1': 'bank', '-2,1': 'garage', '-4,-2': 'hospital', '-1,3': 'mercado',
  '2,4': 'hotel', '4,-4': 'mansion', '0,2': 'plaza',
};
const AIRFIELD_BLOCKS = new Set(['-5,-5', '-4,-5', '-5,-4', '-4,-4']);

function signTexture(text, sub, bg, fg) {
  return canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 52px Arial, sans-serif';
    g.fillText(text, w / 2, sub ? h / 2 - 16 : h / 2);
    if (sub) { g.font = '28px Arial, sans-serif'; g.fillText(sub, w / 2, h / 2 + 34); }
  });
}

function facadeTexture(base, litRatio, rng) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 2);
    const cols = 4, rows = 9;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lit = rng() < litRatio;
        g.fillStyle = lit ? pick(rng, PALETTE.glass) : '#2c3540';
        g.fillRect(10 + c * 30, 12 + r * 27, 20, 16);
      }
    }
  });
}

export function buildWorld(scene) {
  const rng = mulberry32(20261123);
  const colliders = [];
  const landmarks = {};
  const group = new THREE.Group();
  scene.add(group);

  // ---- sky, sun, fog -------------------------------------------------------
  const skyTex = canvasTexture(16, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#6fb7e8'); grad.addColorStop(0.55, '#a8d4ef');
    grad.addColorStop(0.8, '#ffd9a0'); grad.addColorStop(1, '#ffbe78');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  });
  scene.background = skyTex;
  scene.fog = new THREE.Fog(0xf2c98f, 320, 900);
  const sun = new THREE.DirectionalLight(0xfff0c8, 2.4);
  sun.position.set(180, 260, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -220; sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 220; sun.shadow.camera.bottom = -220;
  sun.shadow.camera.far = 800;
  scene.add(sun); scene.add(sun.target);
  scene.add(new THREE.HemisphereLight(0xbfd9ef, 0x8a7a5a, 1.1));

  // ---- ground: one big painted canvas (roads, sidewalks, sand, runway) -----
  const groundTex = canvasTexture(2048, 2048, (g, w, h) => {
    const px = (x) => (x + 450) / WORLD * w;
    const pz = (z) => (z + 450) / WORLD * h;
    const pw = (d) => d / WORLD * w;
    g.fillStyle = '#a9adb0'; g.fillRect(0, 0, w, h); // sidewalk base
    // block pavement tints
    for (let bx = -5; bx <= 4; bx++) for (let bz = -5; bz <= 4; bz++) {
      const shade = 165 + Math.floor(rng() * 22);
      g.fillStyle = `rgb(${shade},${shade - 4},${shade - 10})`;
      g.fillRect(px(bx * 60 + 6), pz(bz * 60 + 6), pw(48), pw(48));
    }
    // sand strip (south) and east shore
    g.fillStyle = '#e8cf9e';
    g.fillRect(0, pz(330), w, h - pz(330));
    g.fillRect(px(380), 0, w - px(380), pz(330));
    // docks concrete
    g.fillStyle = '#8f9497'; g.fillRect(px(330), pz(60), pw(60), pw(180));
    // airfield apron
    g.fillStyle = '#7e8285'; g.fillRect(px(-380), pz(-380), pw(200), pw(120));
    // roads
    g.fillStyle = '#3a3f46';
    for (const r of ROADS) {
      g.fillRect(px(-380), pz(r - 6), pw(760), pw(12));
      g.fillRect(px(r - 6), pz(-380), pw(12), pw(760));
    }
    // lane dashes
    g.fillStyle = '#e8d25d';
    for (const r of ROADS) {
      for (let d = -375; d < 375; d += 18) {
        g.fillRect(px(d), pz(r - 1), pw(9), pw(2));
        g.fillRect(px(r - 1), pz(d), pw(2), pw(9));
      }
    }
    // crosswalks at a few busy crossings
    g.fillStyle = '#e8e8e8';
    for (const [cx, cz] of [[0, 0], [0, 120], [120, 0], [-120, 60], [60, -60]]) {
      for (let i = -2; i <= 2; i++) {
        g.fillRect(px(cx - 5 + i * 2), pz(cz - 6), pw(1.2), pw(12));
        g.fillRect(px(cx - 6), pz(cz - 5 + i * 2), pw(12), pw(1.2));
      }
    }
    // plaza circle
    g.fillStyle = '#c9a86a';
    g.beginPath(); g.arc(px(30), pz(150), pw(24), 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7fb8d9';
    g.beginPath(); g.arc(px(30), pz(150), pw(9), 0, Math.PI * 2); g.fill();
    // runway
    g.fillStyle = '#2e3238'; g.fillRect(px(-370), pz(-340), pw(180), pw(26));
    g.fillStyle = '#ffffff';
    for (let d = -360; d < -190; d += 24) g.fillRect(px(d), pz(-328), pw(12), pw(2));
    g.font = 'bold 28px Arial'; g.fillStyle = '#fff';
    g.fillText('07', px(-360), pz(-318));
  });
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD, WORLD),
    new THREE.MeshLambertMaterial({ map: groundTex }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // ---- ocean: two animated wave planes (south + east) ----------------------
  const waveTex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#1e7fa8'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3;
    for (let i = 0; i < 26; i++) {
      g.beginPath();
      const y = rng() * h;
      g.moveTo(rng() * w, y);
      g.bezierCurveTo(rng() * w, y - 8, rng() * w, y + 8, rng() * w, y);
      g.stroke();
    }
  });
  waveTex.wrapS = waveTex.wrapT = THREE.RepeatWrapping;
  waveTex.repeat.set(10, 6);
  const seaMat = new THREE.MeshLambertMaterial({ map: waveTex, transparent: true, opacity: 0.96 });
  const seaSouth = new THREE.Mesh(new THREE.PlaneGeometry(1100, 420), seaMat);
  seaSouth.rotation.x = -Math.PI / 2; seaSouth.position.set(0, -0.4, 630);
  const seaEast = new THREE.Mesh(new THREE.PlaneGeometry(420, 560), seaMat);
  seaEast.rotation.x = -Math.PI / 2; seaEast.position.set(640, -0.4, 170);
  group.add(seaSouth, seaEast);

  // ---- buildings -----------------------------------------------------------
  const facadeMats = PALETTE.building.slice(0, 6).map((c) =>
    new THREE.MeshLambertMaterial({ map: facadeTexture(c, 0.45, mulberry32(100 + PALETTE.building.indexOf(c))) }));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x6a6f75 });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const buildings = [];
  function addBuilding(cx, cz, w, d, hgt, matIdx, collider = true) {
    const m = new THREE.Mesh(boxGeo, facadeMats[matIdx % facadeMats.length]);
    m.scale.set(w, hgt, d);
    m.position.set(cx, hgt / 2, cz);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    const roof = new THREE.Mesh(boxGeo, roofMat);
    roof.scale.set(w + 0.6, 0.8, d + 0.6);
    roof.position.set(cx, hgt + 0.4, cz);
    group.add(roof);
    if (hgt > 42) {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 9, 6),
        new THREE.MeshLambertMaterial({ color: 0x333333 }));
      ant.position.set(cx, hgt + 5, cz); group.add(ant);
    }
    if (collider) colliders.push({ x: cx, z: cz, hx: w / 2, hz: d / 2 });
    buildings.push(m);
    return m;
  }

  for (let bx = -5; bx <= 4; bx++) {
    for (let bz = -5; bz <= 4; bz++) {
      const key = `${bx},${bz}`;
      if (LANDMARK_BLOCKS[key] || AIRFIELD_BLOCKS.has(key)) continue;
      const cx = bx * 60 + 30, cz = bz * 60 + 30;
      const downtown = Math.abs(cx) < 150 && Math.abs(cz) < 150;
      const n = rng() < 0.45 ? 2 : 1;
      if (n === 1) {
        const w = range(rng, 26, 40), d = range(rng, 26, 40);
        addBuilding(cx + range(rng, -3, 3), cz + range(rng, -3, 3), w, d,
          downtown ? range(rng, 26, 62) : range(rng, 12, 30), Math.floor(rng() * 6));
      } else {
        addBuilding(cx - 11, cz - 8, range(rng, 18, 22), range(rng, 18, 24),
          downtown ? range(rng, 22, 48) : range(rng, 10, 22), Math.floor(rng() * 6));
        addBuilding(cx + 11, cz + 10, range(rng, 18, 22), range(rng, 18, 24),
          downtown ? range(rng, 22, 48) : range(rng, 10, 22), Math.floor(rng() * 6));
      }
    }
  }

  // ---- landmarks -----------------------------------------------------------
  function signBoard(text, sub, bg, fg, w, h) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: signTexture(text, sub, bg, fg) }),
    );
    return m;
  }
  function landmarkBox(cx, cz, w, d, hgt, color, sign, signH = 6) {
    const m = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color }));
    m.scale.set(w, hgt, d); m.position.set(cx, hgt / 2, cz);
    m.castShadow = true; m.receiveShadow = true; group.add(m);
    colliders.push({ x: cx, z: cz, hx: w / 2, hz: d / 2 });
    if (sign) {
      const s = sign;
      s.position.set(cx, hgt + signH / 2 + 1.2, cz + d / 2 + 0.3);
      group.add(s);
    }
    return m;
  }
  // Alba National Bank — marble front, columns, gold sign.
  landmarks.bank = { x: 90, z: -30, name: 'Alba National Bank' };
  landmarkBox(90, -30, 40, 34, 26, 0xe8e0c8,
    signBoard('ALBA NATIONAL BANK', 'EST. 1962', '#1a2a4a', '#ffd76a', 34, 8));
  for (let i = -2; i <= 2; i++) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 16, 10),
      new THREE.MeshLambertMaterial({ color: 0xf2ead0 }));
    col.position.set(90 + i * 7, 8, -30 + 18); col.castShadow = true; group.add(col);
  }
  // Mara's Garage — low workshop with a big coral sign and a forecourt.
  landmarks.garage = { x: -90, z: 90, name: "Mara's Garage" };
  landmarkBox(-90, 90, 36, 26, 12, 0x4a5a66,
    signBoard("MARA'S GARAGE", 'REPAIRS • TUNING', '#c23b2e', '#ffffff', 30, 7));
  const canopy = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x2e3438 }));
  canopy.scale.set(30, 1, 16); canopy.position.set(-90, 9, 112); group.add(canopy);
  // St. Coral Hospital — white tower with a red cross sign.
  landmarks.hospital = { x: -210, z: -90, name: 'St. Coral Hospital' };
  landmarkBox(-210, -90, 34, 30, 34, 0xf2f2ea,
    signBoard('ST. CORAL HOSPITAL', '+ EMERGENCY', '#ffffff', '#c23b2e', 30, 7));
  // Mercado Alba — market hall with striped awnings.
  landmarks.mercado = { x: -30, z: 210, name: 'Mercado Alba' };
  landmarkBox(-30, 210, 38, 28, 14, 0xd9a05a,
    signBoard('MERCADO ALBA', 'FISH • FRUIT • FLOWERS', '#2e6f4a', '#ffe9a8', 30, 7));
  for (let i = 0; i < 5; i++) {
    const awn = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: i % 2 ? 0xe85d5d : 0xffffff }));
    awn.scale.set(6, 0.5, 8); awn.position.set(-46 + i * 8, 6.5, 226); group.add(awn);
  }
  // Hotel Miramar — tall beachfront hotel with a pool deck.
  landmarks.hotel = { x: 150, z: 270, name: 'Hotel Miramar' };
  landmarkBox(150, 270, 36, 30, 52, 0xe8dcc8,
    signBoard('HOTEL MIRAMAR', '★ ★ ★ ★ ★', '#0e5a80', '#ffffff', 32, 8));
  const pool = new THREE.Mesh(new THREE.BoxGeometry(18, 1, 10),
    new THREE.MeshLambertMaterial({ color: 0x35b8d9 }));
  pool.position.set(150, 0.5, 296); group.add(pool);
  // Kroll's Mansion — walled villa on the north-east rise.
  landmarks.mansion = { x: 270, z: -210, name: "Kroll's Mansion" };
  landmarkBox(270, -210, 34, 28, 20, 0xc9a86a,
    signBoard("KROLL'S MANSION", 'PRIVATE', '#3a2a1a', '#e8cf9e', 28, 7));
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x8a7a5a });
  // the north wall leaves a gate open at x 266..274 so the courtyard is reachable
  for (const [wx, wz, ww, wd] of [[254, -182, 24, 2], [286, -182, 24, 2], [270, -238, 56, 2], [242, -210, 2, 56], [298, -210, 2, 56]]) {
    const wall = new THREE.Mesh(boxGeo, wallMat);
    wall.scale.set(ww, 4, wd); wall.position.set(wx, 2, wz); group.add(wall);
    colliders.push({ x: wx, z: wz, hx: ww / 2, hz: wd / 2 });
  }
  // Plaza del Sol — fountain at the middle of an open square.
  landmarks.plaza = { x: 30, z: 150, name: 'Plaza del Sol' };
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(9, 10, 1.6, 24),
    new THREE.MeshLambertMaterial({ color: 0xb8a888 }));
  basin.position.set(30, 0.8, 150); basin.castShadow = true; group.add(basin);
  const pond = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 0.4, 24),
    new THREE.MeshLambertMaterial({ color: 0x35b8d9, transparent: true, opacity: 0.85 }));
  pond.position.set(30, 1.5, 150); group.add(pond);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.6, 5, 10),
    new THREE.MeshLambertMaterial({ color: 0xd8c8a8 }));
  spout.position.set(30, 4, 150); group.add(spout);
  const spray = new THREE.Mesh(new THREE.ConeGeometry(3.2, 4, 12),
    new THREE.MeshLambertMaterial({ color: 0xbfe8f2, transparent: true, opacity: 0.6 }));
  spray.position.set(30, 8, 150); group.add(spray);
  colliders.push({ x: 30, z: 150, hx: 10, hz: 10 });

  // ---- Coral Docks: containers, crane, pier --------------------------------
  landmarks.docks = { x: 372, z: 150, name: 'Coral Docks' };
  const dockSign = signBoard('CORAL DOCKS', 'CONTAINERS • FREIGHT', '#22303a', '#ffd76a', 40, 9);
  dockSign.position.set(360, 16, 62); group.add(dockSign);
  const contColors = [0xc23b2e, 0x2e6fc2, 0xe8b73c, 0x3fae6a, 0x8a5fc2];
  const contGeo = new THREE.BoxGeometry(12, 3.4, 3.2);
  for (let i = 0; i < 14; i++) {
    const c = new THREE.Mesh(contGeo, new THREE.MeshLambertMaterial({ color: contColors[i % 5] }));
    const row = i % 7, stack = Math.floor(i / 7);
    c.position.set(352 + row * 0, 1.7 + stack * 3.5, 96 + row * 13);
    c.rotation.y = Math.PI / 2; c.castShadow = true; group.add(c);
    colliders.push({ x: c.position.x, z: c.position.z, hx: 2, hz: 6.5 });
  }
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xe8b73c });
  for (const [lx, lz] of [[386, 96], [386, 132], [402, 96], [402, 132]]) {
    const leg = new THREE.Mesh(boxGeo, craneMat);
    leg.scale.set(2, 26, 2); leg.position.set(lx, 13, lz); group.add(leg);
  }
  const beam = new THREE.Mesh(boxGeo, craneMat);
  beam.scale.set(4, 2.4, 52); beam.position.set(394, 26, 114); group.add(beam);
  const jib = new THREE.Mesh(boxGeo, craneMat);
  jib.scale.set(34, 2, 3); jib.position.set(414, 27, 114); group.add(jib);
  const hookLine = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 10, 4),
    new THREE.MeshLambertMaterial({ color: 0x222222 }));
  hookLine.position.set(428, 21, 114); group.add(hookLine);
  const pier = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x8a6a4a }));
  pier.scale.set(70, 1.2, 26); pier.position.set(415, 0.6, 150); group.add(pier);

  // ---- Airfield: runway, hangar, a parked prop plane ------------------------
  landmarks.airfield = { x: -280, z: -327, name: 'Alba Airfield' };
  const hangar = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x7a8a99 }));
  hangar.scale.set(30, 12, 22); hangar.position.set(-340, 6, -372); group.add(hangar);
  colliders.push({ x: -340, z: -372, hx: 15, hz: 11 });
  const plane = new THREE.Group();
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.2, 16, 10),
    new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
  fus.rotation.z = Math.PI / 2; plane.add(fus);
  const wing = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xc23b2e }));
  wing.scale.set(4, 0.4, 22); plane.add(wing);
  const tail = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xc23b2e }));
  tail.scale.set(3, 3, 0.5); tail.position.set(-8, 1.5, 0); plane.add(tail);
  plane.position.set(-250, 2, -327); plane.rotation.y = 0.4;
  plane.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  group.add(plane);

  // ---- palms (instanced) and street lamps (instanced) -----------------------
  const palmSpots = [];
  for (let x = -360; x <= 360; x += 24) {
    if (rng() < 0.75) palmSpots.push([x + range(rng, -6, 6), range(rng, 344, 408)]);
    if (rng() < 0.4) palmSpots.push([x + range(rng, -6, 6), range(rng, 396, 408)]);
  }
  for (let i = 0; i < 10; i++) palmSpots.push([range(rng, -40, 100), range(rng, 110, 190)]);
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 7, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
  const crownGeo = new THREE.ConeGeometry(3.4, 4.5, 7);
  const crownMat = new THREE.MeshLambertMaterial({ color: 0x2e8a4a });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, palmSpots.length);
  const dummy = new THREE.Object3D();
  palmSpots.forEach(([x, z], i) => {
    dummy.position.set(x, 3.5, z); dummy.rotation.set(range(rng, -0.06, 0.06), 0, range(rng, -0.06, 0.06));
    dummy.scale.setScalar(1); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 8.2, z); dummy.rotation.set(0, rng() * 6, 0);
    dummy.scale.set(1, 0.85, 1); dummy.updateMatrix(); crowns.setMatrixAt(i, dummy.matrix);
  });
  trunks.castShadow = true; crowns.castShadow = true;
  group.add(trunks, crowns);

  const lampSpots = [];
  for (const r of ROADS) for (let d = -270; d <= 270; d += 60) {
    lampSpots.push([r + 8, d]); lampSpots.push([d, r + 8]);
  }
  const poleGeo = new THREE.CylinderGeometry(0.18, 0.22, 7, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2e3438 });
  const headGeo = new THREE.SphereGeometry(0.7, 8, 6);
  const headMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffd76a, emissiveIntensity: 0.7 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
  const heads = new THREE.InstancedMesh(headGeo, headMat, lampSpots.length);
  lampSpots.forEach(([x, z], i) => {
    dummy.position.set(x, 3.5, z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1);
    dummy.updateMatrix(); poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 7.2, z); dummy.updateMatrix(); heads.setMatrixAt(i, dummy.matrix);
  });
  group.add(poles, heads);

  // ---- drifting clouds ------------------------------------------------------
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  const clouds = [];
  for (let i = 0; i < 9; i++) {
    const cl = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(range(rng, 8, 16), 8, 6), cloudMat);
      puff.position.set(j * 12 - 12, range(rng, -2, 2), range(rng, -4, 4));
      puff.scale.y = 0.45; cl.add(puff);
    }
    cl.position.set(range(rng, -400, 400), range(rng, 120, 170), range(rng, -400, 300));
    clouds.push(cl); group.add(cl);
  }

  // ---- public API -----------------------------------------------------------
  let wavePhase = 0;
  return {
    colliders,
    landmarks,
    roadLines: ROADS,
    buildings,
    sun,
    update(dt) {
      wavePhase += dt * 0.25;
      waveTex.offset.y = wavePhase % 1;
      waveTex.offset.x = (wavePhase * 0.4) % 1;
      spray.rotation.y += dt * 1.5;
      spray.scale.y = 1 + Math.sin(wavePhase * 6) * 0.12;
      for (const cl of clouds) {
        cl.position.x += dt * 2.2;
        if (cl.position.x > 480) cl.position.x = -480;
      }
    },
  };
}
