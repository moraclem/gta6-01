// Costa Alba — cars: procedural low-poly models, traffic AI, police, helicopter.
// One clear job: everything with four wheels (and one rotor).

import * as THREE from 'three';
import { CFG, PALETTE, choice, rand, randInt, clamp, angleLerp, dist2 } from './config.js';

// Build a simple but readable car from boxes: body, cabin, wheels, lights.
export function makeCarMesh(color, kind = 'sedan') {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x182838 });
  const tyre = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const bodyLen = kind === 'truck' ? 5.6 : kind === 'sport' ? 4.4 : 4.6;
  const bodyW = 2.0;
  const bodyH = kind === 'truck' ? 1.1 : 0.75;

  const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyLen), paint);
  body.position.y = 0.65;
  body.castShadow = true;
  g.add(body);

  if (kind === 'truck') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(bodyW - 0.3, 0.5, 2.2), new THREE.MeshLambertMaterial({ color: 0x3a3a3a }));
    bed.position.set(0, 1.2, -1.2);
    g.add(bed);
  } else {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(bodyW - 0.3, 0.65, bodyLen * 0.45), glass);
    cabin.position.set(0, 1.25, kind === 'sport' ? -0.2 : -0.1);
    cabin.castShadow = true;
    g.add(cabin);
  }

  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, tyre);
    w.position.set(wx, 0.38, wz);
    g.add(w);
  }

  // Headlights and taillights.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xd02020 });
  for (const sx of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.08), headMat);
    h.position.set(sx, 0.7, bodyLen / 2 + 0.01);
    g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.08), tailMat);
    t.position.set(sx, 0.7, -bodyLen / 2 - 0.01);
    g.add(t);
  }

  // Police livery: light bar + star doors.
  if (kind === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.4), new THREE.MeshBasicMaterial({ color: 0x2040e0 }));
    bar.position.set(0, 1.62, -0.1);
    g.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.4), new THREE.MeshBasicMaterial({ color: 0xe02020 }));
    bar2.position.set(0.55, 1.62, -0.1);
    g.add(bar2);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4), new THREE.MeshBasicMaterial({ color: 0xf0c020 }));
    sign.position.set(0, 1.62, -0.1);
    g.add(sign);
  }
  g.userData.bodyLen = bodyLen;
  return g;
}

export class Car {
  constructor(mesh, opts = {}) {
    this.mesh = mesh;
    this.x = opts.x || 0;
    this.z = opts.z || 0;
    this.heading = opts.heading || 0;
    this.speed = 0;
    this.steer = 0;
    this.kind = opts.kind || 'sedan';
    this.color = opts.color || 0x888888;
    this.isPolice = opts.isPolice || false;
    this.isPlayer = false;
    this.health = 100;
    this.name = opts.name || 'Car';
    this.parked = !!opts.parked;
    this.stolen = false;
    this.updateMesh();
  }

  updateMesh() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }

  // Arcade driving: throttle -1..1, steer -1..1.
  drive(dt, throttle, steer, topSpeed = CFG.carTopSpeed) {
    const accel = throttle > 0 ? CFG.carAccel : CFG.carAccel * 0.8;
    this.speed += throttle * accel * dt;
    // Drag and rolling resistance.
    this.speed -= this.speed * 0.55 * dt;
    if (throttle === 0) this.speed -= Math.sign(this.speed) * 6 * dt;
    this.speed = clamp(this.speed, -topSpeed * 0.45, topSpeed);
    if (Math.abs(this.speed) < 0.05 && throttle === 0) this.speed = 0;
    const turnRate = 1.9 * clamp(Math.abs(this.speed) / 12, 0.25, 1);
    this.heading += steer * turnRate * dt * Math.sign(this.speed || 1) * (this.speed < 0 ? -1 : 1);
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    this.updateMesh();
  }
}

export class Traffic {
  constructor(G) {
    this.G = G;
    this.cars = []; // ambient traffic + parked
    this.police = [];
    this.heli = null;
    this.heliLight = null;
    this.spawnTimer = 0;
    this.buildHelicopter();
    for (let i = 0; i < 14; i++) this.spawnTrafficCar(true);
    for (let i = 0; i < 10; i++) this.spawnParkedCar();
  }

  buildHelicopter() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 1.6, 4.5),
      new THREE.MeshLambertMaterial({ color: PALETTE.police })
    );
    body.castShadow = true;
    g.add(body);
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 1.0, 1.2),
      new THREE.MeshLambertMaterial({ color: 0x182838 })
    );
    glass.position.set(0, 0.2, 1.8);
    g.add(glass);
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 4),
      new THREE.MeshLambertMaterial({ color: PALETTE.police })
    );
    tail.position.set(0, 0.3, -3.8);
    g.add(tail);
    const rotor = new THREE.Mesh(
      new THREE.BoxGeometry(9, 0.08, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x222222 })
    );
    rotor.position.y = 1.1;
    g.add(rotor);
    this.heliRotor = rotor;
    const spot = new THREE.SpotLight(0xfff2c0, 0, 120, 0.35, 0.5, 1);
    spot.position.set(0, -1, 0);
    const target = new THREE.Object3D();
    target.position.set(0, -30, 0);
    g.add(target);
    spot.target = target;
    g.add(spot);
    this.heliLight = spot;
    g.visible = false;
    this.G.scene.add(g);
    this.heli = g;
  }

  spawnTrafficCar(anywhere = false) {
    const { city } = this.G;
    const p = this.G.config.randomRoadPoint();
    const vertical = Math.abs(p.x % 80) < 1;
    const heading = vertical ? (Math.random() < 0.5 ? 0 : Math.PI) : (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    const kind = choice(['sedan', 'sedan', 'sedan', 'sport', 'truck', 'taxi']);
    const color = kind === 'taxi' ? PALETTE.taxi : choice(PALETTE.car);
    const mesh = makeCarMesh(color, kind);
    this.G.scene.add(mesh);
    const car = new Car(mesh, {
      x: p.x + rand(-3, 3), z: p.z + rand(-3, 3), heading, kind, color,
      name: choice(['Veloce', 'Bison', 'Comet', 'Sandpiper', 'Alba']) + ' ' + randInt(100, 999),
    });
    car.speed = rand(8, 16);
    car.parked = false;
    car.targetSpeed = rand(9, 17);
    car.lane = choice([-4, 4]);
    this.cars.push(car);
    return car;
  }

  spawnParkedCar() {
    const { city } = this.G;
    const p = this.G.config.randomRoadPoint();
    const vertical = Math.abs(p.x % 80) < 1;
    const heading = vertical ? (Math.random() < 0.5 ? 0 : Math.PI) : (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    const kind = choice(['sedan', 'sport', 'truck']);
    const mesh = makeCarMesh(choice(PALETTE.car), kind);
    this.G.scene.add(mesh);
    const car = new Car(mesh, {
      x: p.x + (vertical ? 6.5 : rand(-3, 3)),
      z: p.z + (vertical ? rand(-3, 3) : 6.5),
      heading, kind, parked: true,
      name: choice(['Veloce', 'Bison', 'Comet', 'Sandpiper', 'Alba']) + ' ' + randInt(100, 999),
    });
    this.cars.push(car);
    return car;
  }

  spawnPoliceCar(nearX, nearZ) {
    const mesh = makeCarMesh(PALETTE.police, 'police');
    this.G.scene.add(mesh);
    const a = rand(0, Math.PI * 2);
    const car = new Car(mesh, {
      x: nearX + Math.sin(a) * rand(40, 70),
      z: nearZ + Math.cos(a) * rand(40, 70),
      heading: a, kind: 'police', isPolice: true, name: 'APD Interceptor',
    });
    car.speed = 10;
    this.police.push(car);
    return car;
  }

  removePoliceCar(car) {
    this.G.scene.remove(car.mesh);
    this.police = this.police.filter((c) => c !== car);
  }

  nearestCar(x, z, maxDist = 6) {
    let best = null;
    let bestD = maxDist;
    for (const c of [...this.cars, ...this.police]) {
      if (c.isPlayer) continue;
      const d = dist2(x, z, c.x, c.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  // Traffic follows the road grid: drive straight, turn at intersections.
  updateTrafficCar(car, dt) {
    const lines = [ -320, -240, -160, -80, 0, 80, 160, 240, 320 ];
    const onVertical = Math.abs(Math.sin(car.heading)) < 0.5;
    // At an intersection, sometimes turn.
    const nearX = lines.some((l) => Math.abs(car.x - l) < 2);
    const nearZ = lines.some((l) => Math.abs(car.z - l) < 2);
    if (nearX && nearZ && Math.random() < dt * 0.9) {
      car.heading += choice([-Math.PI / 2, Math.PI / 2]);
    }
    // Keep to the road: nudge back toward the nearest road line.
    const target = onVertical
      ? { x: this.G.config.nearestRoadCoord(car.x) + car.lane, z: car.z }
      : { x: car.x, z: this.G.config.nearestRoadCoord(car.z) + car.lane };
    const wantHeading = Math.atan2(target.x - car.x, target.z - car.z);
    // Only steer toward the lane when roughly aligned with it.
    let steer = 0;
    const dh = wantHeading - car.heading;
    if (Math.abs(dh) < 1.2) steer = clamp(dh * 2, -1, 1);
    // Slow for the car ahead.
    let targetSpeed = car.targetSpeed || 12;
    for (const o of this.cars) {
      if (o === car || o.isPlayer) continue;
      const ahead = (o.x - car.x) * Math.sin(car.heading) + (o.z - car.z) * Math.cos(car.heading);
      const side = Math.abs((o.x - car.x) * Math.cos(car.heading) - (o.z - car.z) * Math.sin(car.heading));
      if (ahead > 0 && ahead < 12 && side < 3) targetSpeed = 0;
    }
    const throttle = car.speed < targetSpeed ? 0.7 : 0;
    car.drive(dt, throttle, steer, targetSpeed + 4);
    const fixed = this.G.city.collideCircle(car.x, car.z, 2.2);
    car.x = fixed.x;
    car.z = fixed.z;
    car.updateMesh();
    // Despawn far away, respawn near the player.
    const p = this.G.player;
    if (p && dist2(car.x, car.z, p.x, p.z) > 420) {
      this.G.scene.remove(car.mesh);
      this.cars = this.cars.filter((c) => c !== car);
      this.spawnTrafficCar();
    }
  }

  updatePolice(dt) {
    const p = this.G.player;
    const wanted = this.G.state.wanted;
    // Spawn / despawn to match wanted level.
    const wantCount = wanted === 0 ? 0 : wanted <= 2 ? 2 : wanted <= 3 ? 3 : 5;
    while (this.police.length < wantCount) this.spawnPoliceCar(p.x, p.z);
    while (this.police.length > wantCount) this.removePoliceCar(this.police[0]);
    for (const car of [...this.police]) {
      const d = dist2(car.x, car.z, p.x, p.z);
      const wantHeading = Math.atan2(p.x - car.x, p.z - car.z);
      let dh = wantHeading - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const steer = clamp(dh * 1.6, -1, 1);
      const throttle = d > 6 ? 1 : 0.4;
      car.drive(dt, throttle, steer, 34 + wanted * 2);
      const fixed = this.G.city.collideCircle(car.x, car.z, 2.2);
      car.x = fixed.x;
      car.z = fixed.z;
      car.updateMesh();
      // Ram the player: on foot it hurts, in a car it shoves.
      if (d < 3.4) {
        if (p.inCar) {
          const pc = p.car;
          pc.x += Math.sin(car.heading) * 2.4;
          pc.z += Math.cos(car.heading) * 2.4;
          pc.speed *= 0.6;
          if (Math.random() < dt * 2) this.G.audio.crash();
        } else if (Math.random() < dt * 1.2) {
          p.damage(8, 'police');
        }
      }
      if (d > 500) this.removePoliceCar(car);
    }
    // Helicopter at 3+ stars: circles the player with a searchlight.
    const heliOn = wanted >= 3;
    this.heli.visible = heliOn;
    if (heliOn) {
      const t = this.G.time * 0.5;
      this.heli.position.set(p.x + Math.cos(t) * 26, 42, p.z + Math.sin(t) * 26);
      this.heli.lookAt(p.x, 0, p.z);
      this.heliRotor.rotation.y += dt * 22;
      this.heliLight.intensity = 900;
    } else {
      this.heliLight.intensity = 0;
    }
  }

  update(dt) {
    this.spawnTimer += dt;
    for (const car of [...this.cars]) {
      if (car.isPlayer || car.parked) continue;
      this.updateTrafficCar(car, dt);
    }
    // Keep traffic topped up.
    if (this.cars.filter((c) => !c.parked && !c.isPlayer).length < 12 && this.spawnTimer > 2) {
      this.spawnTimer = 0;
      this.spawnTrafficCar();
    }
    this.updatePolice(dt);
  }
}
