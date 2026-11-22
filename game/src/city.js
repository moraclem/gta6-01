// Costa Alba — builds the whole 3D city from boxes and canvas textures.
// One clear job: geometry, landmarks, props and collision data.

import * as THREE from 'three';
import { CFG, PALETTE, PLACES, choice, rand, randInt } from './config.js';

function makeBuildingTexture(base, litRatio) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  // Window grid, some lit warm.
  for (let y = 12; y < 244; y += 22) {
    for (let x = 10; x < 118; x += 18) {
      const lit = Math.random() < litRatio;
      g.fillStyle = lit ? '#ffd98a' : 'rgba(20,30,50,0.85)';
      g.fillRect(x, y, 11, 14);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRoadTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3f46';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#f0d040';
  g.fillRect(62, 8, 4, 40);
  g.fillRect(62, 80, 4, 40);
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fillRect(0, 0, 128, 3);
  g.fillRect(0, 125, 128, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class City {
  constructor(scene) {
    this.scene = scene;
    this.buildings = []; // {x, z, hw, hd, h} collision boxes
    this.lamps = [];
    this.beacon = null; // mission marker beacon mesh
    this.ocean = null;
    this.build();
  }

  build() {
    const scene = this.scene;

    // Lights and sky.
    scene.background = new THREE.Color(PALETTE.sky);
    scene.fog = new THREE.Fog(0x9fc8e8, 220, 900);
    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.9);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(PALETTE.sun, 2.2);
    sun.position.set(180, 260, 120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -380;
    sun.shadow.camera.right = 380;
    sun.shadow.camera.top = 380;
    sun.shadow.camera.bottom = -380;
    sun.shadow.camera.far = 900;
    scene.add(sun);
    this.sun = sun;

    // Ground: grass base, sand strip, ocean.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1100, 1100),
      new THREE.MeshLambertMaterial({ color: PALETTE.grass })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.05, -40);
    ground.receiveShadow = true;
    scene.add(ground);

    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(1100, 52),
      new THREE.MeshLambertMaterial({ color: PALETTE.sand })
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0, CFG.beachZ + 8);
    sand.receiveShadow = true;
    scene.add(sand);

    this.ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(1100, 400),
      new THREE.MeshLambertMaterial({ color: PALETTE.ocean })
    );
    this.ocean.rotation.x = -Math.PI / 2;
    this.ocean.position.set(0, -0.4, CFG.oceanZ + 180);
    scene.add(this.ocean);

    // Roads: asphalt strips with dashed centre lines, plus sidewalks.
    const roadTex = makeRoadTexture();
    const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
    const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
    for (let c = -CFG.half; c <= CFG.half; c += CFG.roadGap) {
      for (const vertical of [true, false]) {
        const len = CFG.half * 2 + CFG.roadWidth;
        const geo = vertical
          ? new THREE.PlaneGeometry(CFG.roadWidth, len)
          : new THREE.PlaneGeometry(len, CFG.roadWidth);
        const road = new THREE.Mesh(geo, roadMat);
        road.material = roadMat.clone();
        road.material.map = roadTex.clone();
        road.material.map.repeat.set(1, len / 16);
        road.material.map.needsUpdate = true;
        road.rotation.x = -Math.PI / 2;
        road.position.set(vertical ? c : 0, 0.02, vertical ? 0 : c);
        road.receiveShadow = true;
        scene.add(road);
        // Sidewalk strips flanking the road.
        for (const s of [-1, 1]) {
          const walkGeo = vertical ? new THREE.PlaneGeometry(4, len) : new THREE.PlaneGeometry(len, 4);
          const walk = new THREE.Mesh(walkGeo, walkMat);
          walk.rotation.x = -Math.PI / 2;
          walk.position.set(
            vertical ? c + s * (CFG.roadWidth / 2 + 2) : 0,
            0.03,
            vertical ? 0 : c + s * (CFG.roadWidth / 2 + 2)
          );
          walk.receiveShadow = true;
          scene.add(walk);
        }
      }
    }

    // Buildings, one block at a time. Skip plaza centre, docks and mansion plots.
    const skipPlots = [
      { x: 0, z: 0 }, // Plaza del Sol
      { x: 280, z: 200 }, // docks
      { x: -280, z: -280 }, // mansion
      { x: 120, z: 320 }, // beach
    ];
    const texCache = {};
    const getTex = (base) => {
      if (!texCache[base]) texCache[base] = makeBuildingTexture(base, 0.25);
      return texCache[base];
    };
    for (let bx = -CFG.half + CFG.roadGap / 2; bx <= CFG.half - CFG.roadGap / 2; bx += CFG.roadGap) {
      for (let bz = -CFG.half + CFG.roadGap / 2; bz <= CFG.half - CFG.roadGap / 2; bz += CFG.roadGap) {
        if (bz > CFG.beachZ - 40) continue; // beach, no buildings
        if (skipPlots.some((p) => Math.abs(p.x - bx) < 40 && Math.abs(p.z - bz) < 40)) continue;
        const count = randInt(1, 3);
        for (let i = 0; i < count; i++) {
          const w = rand(16, 26);
          const d = rand(16, 26);
          const h = rand(14, 70) * (Math.abs(bx) < 100 && Math.abs(bz) < 100 ? 1.6 : 1);
          const ox = rand(-14, 14);
          const oz = rand(-14, 14);
          const x = bx + ox;
          const z = bz + oz;
          const base = '#' + choice(PALETTE.building).toString(16).padStart(6, '0');
          const mat = new THREE.MeshLambertMaterial({ map: getTex(base) });
          const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
          b.position.set(x, h / 2, z);
          b.castShadow = true;
          b.receiveShadow = true;
          scene.add(b);
          // Rooftop box for skyline variety.
          if (h > 40 && Math.random() < 0.5) {
            const roof = new THREE.Mesh(
              new THREE.BoxGeometry(w * 0.4, 4, d * 0.4),
              new THREE.MeshLambertMaterial({ color: 0x666666 })
            );
            roof.position.set(x, h + 2, z);
            scene.add(roof);
          }
          this.buildings.push({ x, z, hw: w / 2, hd: d / 2, h });
        }
        // Palm trees on the block corners.
        if (Math.random() < 0.7) this.addPalm(bx + rand(-24, 24), bz + rand(-24, 24));
      }
    }

    this.buildLandmarks();
    this.buildProps();
    this.buildBeacon();
  }

  addPalm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.55, 7, 6),
      new THREE.MeshLambertMaterial({ color: 0x8a6a42 })
    );
    trunk.position.y = 3.5;
    trunk.rotation.z = 0.12;
    trunk.castShadow = true;
    g.add(trunk);
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e8a3a });
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.5, 4), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.6, 7.2, Math.sin(a) * 1.6);
      leaf.rotation.z = Math.cos(a) * 1.1;
      leaf.rotation.x = -Math.sin(a) * 1.1;
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    this.scene.add(g);
  }

  addLamp(x, z) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 6, 6),
      new THREE.MeshLambertMaterial({ color: 0x333333 })
    );
    pole.position.y = 3;
    g.add(pole);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe9a0 })
    );
    head.position.y = 6.1;
    g.add(head);
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.lamps.push(head);
  }

  buildLandmarks() {
    const scene = this.scene;
    const mk = (x, z, w, h, d, color, name) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshLambertMaterial({ color })
      );
      m.position.set(x, h / 2, z);
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.placeName = name;
      scene.add(m);
      this.buildings.push({ x, z, hw: w / 2, hd: d / 2, h });
      return m;
    };
    // Alba National Bank — marble block with columns.
    mk(PLACES.bank.x, PLACES.bank.z, 34, 22, 26, 0xe8e0d0, PLACES.bank.name);
    for (let i = -2; i <= 2; i++) {
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(1, 1, 16, 8),
        new THREE.MeshLambertMaterial({ color: 0xf5f0e0 })
      );
      col.position.set(PLACES.bank.x + i * 6, 8, PLACES.bank.z + 14);
      scene.add(col);
    }
    // Kroll's mansion — big white villa with red roof.
    const man = mk(PLACES.mansion.x, PLACES.mansion.z, 40, 16, 30, 0xf0e8d8, PLACES.mansion.name);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(26, 8, 4),
      new THREE.MeshLambertMaterial({ color: 0xa03028 })
    );
    roof.position.set(PLACES.mansion.x, 20, PLACES.mansion.z);
    roof.rotation.y = Math.PI / 4;
    scene.add(roof);
    man.userData.roof = roof;
    // Mara's garage — low workshop with a sign-coloured roof.
    mk(PLACES.marasGarage.x, PLACES.marasGarage.z, 30, 9, 22, 0x4a6a8a, PLACES.marasGarage.name);
    // Hotel Miramar — tall tower.
    mk(PLACES.hotel.x, PLACES.hotel.z, 24, 64, 24, 0xd8e8f0, PLACES.hotel.name);
    // St. Coral Hospital — white block with a red cross box.
    mk(PLACES.hospital.x, PLACES.hospital.z, 30, 18, 24, 0xf8f8f8, PLACES.hospital.name);
    const cross = new THREE.Mesh(
      new THREE.BoxGeometry(8, 8, 1),
      new THREE.MeshBasicMaterial({ color: 0xd02020 })
    );
    cross.position.set(PLACES.hospital.x, 20, PLACES.hospital.z + 13);
    scene.add(cross);
    // Mercado Alba — market hall.
    mk(PLACES.market.x, PLACES.market.z, 36, 10, 26, 0xc8a060, PLACES.market.name);
    // Docks: containers and a crane.
    for (let i = 0; i < 8; i++) {
      const cont = new THREE.Mesh(
        new THREE.BoxGeometry(12, 3, 3),
        new THREE.MeshLambertMaterial({ color: choice([0xb03030, 0x3050b0, 0x30a050, 0xd08020]) })
      );
      cont.position.set(PLACES.docks.x - 20 + (i % 4) * 14, 1.5, PLACES.docks.z - 8 + Math.floor(i / 4) * 8);
      cont.castShadow = true;
      scene.add(cont);
      this.buildings.push({ x: cont.position.x, z: cont.position.z, hw: 6, hd: 1.5, h: 3 });
    }
    const crane = new THREE.Group();
    const legMat = new THREE.MeshLambertMaterial({ color: 0xd8a020 });
    for (const [lx, lz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1, 30, 1), legMat);
      leg.position.set(lx, 15, lz);
      crane.add(leg);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(26, 2, 2), legMat);
    beam.position.set(8, 30, 0);
    crane.add(beam);
    crane.position.set(PLACES.docks.x + 10, 0, PLACES.docks.z + 18);
    scene.add(crane);
    // Plaza del Sol — fountain.
    const basin = new THREE.Mesh(
      new THREE.CylinderGeometry(10, 10, 1.2, 20),
      new THREE.MeshLambertMaterial({ color: 0xb0c8d8 })
    );
    basin.position.set(0, 0.6, 0);
    scene.add(basin);
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(9, 9, 0.4, 20),
      new THREE.MeshLambertMaterial({ color: 0x2a90c8 })
    );
    water.position.set(0, 1.1, 0);
    scene.add(water);
    // Airfield: runway strip.
    const runway = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 200),
      new THREE.MeshLambertMaterial({ color: 0x555a60 })
    );
    runway.rotation.x = -Math.PI / 2;
    runway.position.set(PLACES.airport.x, 0.04, PLACES.airport.z);
    runway.receiveShadow = true;
    scene.add(runway);
  }

  buildProps() {
    // Street lamps along every avenue, palms along the beach.
    for (let c = -CFG.half; c <= CFG.half; c += CFG.roadGap) {
      for (let z = -CFG.half + 40; z <= CFG.half - 40; z += CFG.roadGap) {
        this.addLamp(c + 10, z);
      }
    }
    for (let x = -300; x <= 300; x += 40) this.addPalm(x + rand(-6, 6), CFG.beachZ + rand(-4, 10));
  }

  buildBeacon() {
    // Vertical light pillar marking the current mission objective.
    const geo = new THREE.CylinderGeometry(2.2, 2.2, 120, 12, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd040, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false,
    });
    this.beacon = new THREE.Mesh(geo, mat);
    this.beacon.position.set(0, 60, 0);
    this.beacon.visible = false;
    this.scene.add(this.beacon);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3, 4.5, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    this.beacon.add(ring);
    ring.position.set(0, -59.9, 0);
  }

  setBeacon(x, z, visible) {
    this.beacon.visible = visible;
    this.beacon.position.x = x;
    this.beacon.position.z = z;
  }

  // Circle vs building AABBs. Returns corrected {x, z} for a circle of radius r.
  collideCircle(x, z, r) {
    for (const b of this.buildings) {
      const cx = Math.max(b.x - b.hw, Math.min(x, b.x + b.hw));
      const cz = Math.max(b.z - b.hd, Math.min(z, b.z + b.hd));
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * r;
          z = cz + (dz / d) * r;
        } else {
          x += r;
        }
      }
    }
    // World bounds and ocean edge.
    x = Math.max(-CFG.half - 20, Math.min(CFG.half + 20, x));
    z = Math.max(-CFG.half - 20, Math.min(CFG.oceanZ + 6, z));
    return { x, z };
  }

  // Random sidewalk point (for pedestrians).
  randomWalkPoint() {
    return { x: rand(-CFG.half, CFG.half), z: rand(-CFG.half, CFG.beachZ) };
  }

  update(dt, time) {
    // Gentle ocean swell and beacon pulse.
    if (this.ocean) this.ocean.position.y = -0.4 + Math.sin(time * 0.7) * 0.15;
    if (this.beacon && this.beacon.visible) {
      this.beacon.material.opacity = 0.28 + Math.sin(time * 3) * 0.1;
      this.beacon.rotation.y += dt * 0.6;
    }
  }
}
