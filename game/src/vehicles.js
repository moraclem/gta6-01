// Costa Alba — vehicles: box-built cars, parked stealables, grid traffic and
// arcade driving physics. No physics library; circles against boxes is enough.
import * as THREE from 'three';
import { mulberry32, range, pick, clamp, angleDiff, resolveCircleVsBox, PALETTE } from './util.js';
import { GRID, ROAD_W, CITY_HALF } from './world.js';

const CAR_NAMES = ['Comet GT', 'Alba Cruiser', 'Coral Sedan', 'Solmar Coupe', 'Dune Buggy', 'Harbor Van', 'Taxi Libre', 'Palm Pickup'];

export class CarFleet {
  constructor(scene, world, bus) {
    this.scene = scene;
    this.world = world;
    this.bus = bus;
    this.cars = [];
    this.rng = mulberry32(77031);
    this.wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.5, 10);
    this.wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
    this.bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  }

  makeCar(x, z, heading, color, kind = 'traffic', name = null) {
    const g = new THREE.Group();
    const paint = new THREE.MeshLambertMaterial({ color });
    const glass = new THREE.MeshLambertMaterial({ color: 0x1a2a3a });
    const body = new THREE.Mesh(this.bodyGeo, paint);
    body.scale.set(2.1, 0.85, 4.4); body.position.y = 0.75; body.castShadow = true;
    g.add(body);
    const cabin = new THREE.Mesh(this.bodyGeo, glass);
    cabin.scale.set(1.8, 0.7, 2.1); cabin.position.set(0, 1.45, -0.2); cabin.castShadow = true;
    g.add(cabin);
    const bumper = new THREE.Mesh(this.bodyGeo, new THREE.MeshLambertMaterial({ color: 0x2e3438 }));
    bumper.scale.set(2.15, 0.3, 0.4); bumper.position.set(0, 0.45, 2.2); g.add(bumper);
    const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffedb0, emissiveIntensity: 0.8 });
    for (const sx of [-0.7, 0.7]) {
      const hl = new THREE.Mesh(this.bodyGeo, lightMat);
      hl.scale.set(0.4, 0.25, 0.1); hl.position.set(sx, 0.85, 2.22); g.add(hl);
      const tl = new THREE.Mesh(this.bodyGeo, new THREE.MeshLambertMaterial({ color: 0xc23b2e, emissive: 0x7a1a10, emissiveIntensity: 0.6 }));
      tl.scale.set(0.4, 0.25, 0.1); tl.position.set(sx, 0.85, -2.22); g.add(tl);
    }
    const wheels = [];
    for (const [wx, wz] of [[-1.05, 1.45], [1.05, 1.45], [-1.05, -1.45], [1.05, -1.45]]) {
      const w = new THREE.Mesh(this.wheelGeo, this.wheelMat);
      w.rotation.z = Math.PI / 2; w.position.set(wx, 0.55, wz); w.castShadow = true;
      g.add(w); wheels.push(w);
    }
    g.position.set(x, 0, z);
    g.rotation.y = heading;
    this.scene.add(g);
    const car = {
      group: g, kind, name: name || pick(this.rng, CAR_NAMES),
      heading, speed: 0, steer: 0, color,
      route: null, routeIdx: 0, targetSpeed: 11,
      wheels, brake: false, dead: false, health: 100,
      smoke: null, driver: kind === 'traffic',
    };
    this.cars.push(car);
    return car;
  }

  // Parked cars line the kerb; a few are flagged as the mission's special rides.
  spawnParked(count, specialSpots = []) {
    const spots = [];
    for (const s of specialSpots) spots.push(s);
    let tries = 0;
    while (spots.length < count && tries < 400) {
      tries++;
      const alongRoad = this.rng() < 0.5;
      const road = pick(this.rng, [-300, -240, -180, -120, -60, 0, 60, 120, 180, 240, 300]);
      const along = Math.floor(range(this.rng, -300, 300) / 60) * 60 + 30 + range(this.rng, -12, 12);
      const x = alongRoad ? along : road + (this.rng() < 0.5 ? 8.5 : -8.5);
      const z = alongRoad ? road + (this.rng() < 0.5 ? 8.5 : -8.5) : along;
      if (Math.abs(x) > CITY_HALF + 20 || Math.abs(z) > CITY_HALF + 20) continue;
      if (this.world.colliders.some((b) => Math.abs(x - b.x) < b.hx + 3 && Math.abs(z - b.z) < b.hz + 3)) continue;
      if (spots.some(([sx, sz]) => Math.abs(x - sx) < 8 && Math.abs(z - sz) < 8)) continue;
      spots.push([x, z, alongRoad ? (z > road ? Math.PI : 0) : (x > road ? Math.PI / 2 : -Math.PI / 2)]);
    }
    return spots.map(([x, z, h], i) => {
      const c = this.makeCar(x, z, h ?? 0, pick(this.rng, PALETTE.carPaint), 'parked');
      c.special = specialSpots[i] ? specialSpots[i].tag : null;
      return c;
    });
  }

  spawnTraffic(count) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const road = pick(this.rng, [-300, -240, -180, -120, -60, 0, 60, 120, 180, 240, 300]);
      const along = range(this.rng, -290, 290);
      const eastWest = this.rng() < 0.5;
      const dir = this.rng() < 0.5 ? 1 : -1;
      const lane = 3;
      const x = eastWest ? along : road + lane * dir;
      const z = eastWest ? road + lane * dir : along;
      const heading = eastWest ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
      const car = this.makeCar(x, z, heading, pick(this.rng, PALETTE.carPaint), 'traffic');
      car.targetSpeed = range(this.rng, 8, 14);
      car.axis = eastWest ? 'x' : 'z';
      car.dir = dir;
      car.road = road;
      out.push(car);
    }
    return out;
  }

  // One arcade physics step for any car. throttle -1..1, steer -1..1.
  drive(car, dt, throttle, steer) {
    const accel = car.kind === 'police' ? 22 : 16;
    car.speed += throttle * accel * dt;
    car.speed -= car.speed * 0.9 * dt; // drag + rolling resistance
    if (Math.abs(car.speed) < 0.05 && throttle === 0) car.speed = 0;
    car.speed = clamp(car.speed, -9, car.kind === 'police' ? 34 : 30);
    const grip = clamp(Math.abs(car.speed) / 8, 0.25, 1);
    car.heading += steer * grip * (car.speed / 9) * dt * (car.speed >= 0 ? 1 : -1);
    car.steer = steer;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    car.group.position.x += fx * car.speed * dt;
    car.group.position.z += fz * car.speed * dt;
    car.group.rotation.y = car.heading;
    car.group.position.x = clamp(car.group.position.x, -420, 440);
    car.group.position.z = clamp(car.group.position.z, -420, 440);
    // building collision: slide along walls
    for (const b of this.world.colliders) {
      const hit = resolveCircleVsBox(car.group.position.x, car.group.position.z, 2.3, b);
      if (hit) {
        car.group.position.x = hit.x; car.group.position.z = hit.z;
        if (Math.abs(car.speed) > 6) { car.speed *= 0.55; this.bus.emit('crash', { car, speed: car.speed }); }
        else car.speed *= 0.7;
      }
    }
    // car-to-car bump
    for (const other of this.cars) {
      if (other === car || other.dead) continue;
      const dx = other.group.position.x - car.group.position.x;
      const dz = other.group.position.z - car.group.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01 && d < 4.4) {
        const push = (4.4 - d) / 2;
        car.group.position.x -= (dx / d) * push;
        car.group.position.z -= (dz / d) * push;
        car.speed *= 0.85;
      }
    }
    // wheels
    for (let i = 0; i < car.wheels.length; i++) {
      const w = car.wheels[i];
      w.rotation.x += (car.speed * dt) / 0.55;
      if (i < 2) w.rotation.y = car.steer * 0.35;
    }
    // smoke when wrecked
    if (car.health < 35 && !car.smoke) {
      car.smoke = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0x555555, transparent: true, opacity: 0.5 }));
      car.smoke.position.y = 2; car.group.add(car.smoke);
    }
    if (car.smoke) car.smoke.scale.setScalar(1 + Math.sin(performance.now() / 300) * 0.15);
  }

  updateTraffic(dt, playerPos) {
    for (const car of this.cars) {
      if (car.kind !== 'traffic' || car.dead) continue;
      // slow down for a car ahead
      let blocked = false;
      for (const o of this.cars) {
        if (o === car || o.dead) continue;
        const dx = o.group.position.x - car.group.position.x;
        const dz = o.group.position.z - car.group.position.z;
        const ahead = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
        const side = Math.abs(dx * Math.cos(car.heading) - dz * Math.sin(car.heading));
        if (ahead > 0 && ahead < 11 && side < 3) { blocked = true; break; }
      }
      // keep to the grid: at each intersection, sometimes turn
      const p = car.group.position;
      const nearX = Math.abs(p.x % 60) < 3 || Math.abs(p.x % 60) > 57;
      const nearZ = Math.abs(p.z % 60) < 3 || Math.abs(p.z % 60) > 57;
      if (nearX && nearZ && this.rng() < dt * 0.5) {
        const turn = pick(this.rng, ['left', 'right', 'straight']);
        if (turn !== 'straight') {
          const delta = turn === 'left' ? -Math.PI / 2 : Math.PI / 2;
          car.heading += delta;
          car.axis = car.axis === 'x' ? 'z' : 'x';
        }
      }
      const target = blocked ? 0 : car.targetSpeed;
      const throttle = target > car.speed ? 0.55 : (target < car.speed ? -0.4 : 0);
      // steer gently back onto the lane line
      const laneOffset = car.axis === 'x'
        ? (p.z - car.road) : (p.x - car.road);
      const steer = clamp(-laneOffset * 0.06 + angleDiff(car.heading, car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI)) * 0.4, -0.5, 0.5);
      this.drive(car, dt, throttle, steer);
    }
  }

  nearestCar(x, z, maxDist, kinds = ['parked', 'traffic']) {
    let best = null, bestD = maxDist;
    for (const c of this.cars) {
      if (!kinds.includes(c.kind) || c.dead) continue;
      const d = Math.hypot(c.group.position.x - x, c.group.position.z - z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  remove(car) {
    this.scene.remove(car.group);
    this.cars = this.cars.filter((c) => c !== car);
  }
}
