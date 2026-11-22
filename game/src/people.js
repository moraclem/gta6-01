// Costa Alba — people: sidewalk pedestrians, police interceptors that chase and
// ram, the searchlight helicopter at 3+ stars, and armed goons for missions.
import * as THREE from 'three';
import { mulberry32, range, pick, clamp, angleDiff, angleLerp, resolveCircleVsBox, PALETTE } from './util.js';

function buildWalker(scene, shirtColor, scale = 1) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const skinTones = [0xe8b88a, 0xc98a5a, 0x8a5a3a, 0xf2c9a0];
  const skin = new THREE.MeshLambertMaterial({ color: skinTones[Math.floor(Math.random() * skinTones.length)] });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.34), shirt);
  torso.position.y = 1.15; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42),
    new THREE.MeshLambertMaterial({ color: 0x2a2018 }));
  head.position.y = 1.8; head.castShadow = true; g.add(head);
  const face = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.1), skin);
  face.position.set(0, 1.78, 0.2); g.add(face);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.8, 0.26),
    new THREE.MeshLambertMaterial({ color: 0x2e3438 }));
  legL.position.set(-0.16, 0.4, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.16; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.2), shirt);
  armL.position.set(-0.42, 1.15, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.42; g.add(armR);
  g.scale.setScalar(scale);
  scene.add(g);
  return { group: g, legL, legR, armL, armR, walkPhase: Math.random() * 6 };
}

export class Crowd {
  constructor(scene, world, fleet, bus) {
    this.scene = scene; this.world = world; this.fleet = fleet; this.bus = bus;
    this.rng = mulberry32(4451);
    this.peds = [];
    this.policeCars = [];
    this.goons = [];
    this.heli = null;
    this.wanted = 0;
    this.flashT = 0;
    bus.on('gunshot', ({ x, z }) => this.scarePeds(x, z));
  }

  spawnPedestrians(count) {
    for (let i = 0; i < count; i++) {
      const w = buildWalker(this.scene, pick(this.rng, PALETTE.shirt));
      const x = range(this.rng, -300, 300), z = range(this.rng, -300, 300);
      w.group.position.set(x, 0, z);
      const ped = { ...w, x, z, heading: this.rng() * Math.PI * 2, speed: range(this.rng, 1.2, 2.2),
        target: null, fleeT: 0, dead: false };
      ped.target = this.randomStrollTarget(x, z);
      this.peds.push(ped);
    }
  }

  randomStrollTarget(x, z) {
    return { x: clamp(x + range(this.rng, -70, 70), -320, 320), z: clamp(z + range(this.rng, -70, 70), -320, 320) };
  }

  scarePeds(x, z) {
    for (const p of this.peds) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < 45) {
        p.fleeT = 3;
        p.target = { x: p.x + (p.x - x) * 2, z: p.z + (p.z - z) * 2 };
      }
    }
  }

  spawnGoon(x, z, opts = {}) {
    const w = buildWalker(this.scene, opts.boss ? 0x8a1a1a : 0x3a3a3a, opts.boss ? 1.15 : 1);
    w.group.position.set(x, 0, z);
    // a pistol in the goon's hand, so the threat reads at a glance
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x111111 }));
    gun.position.set(0.42, 1.0, 0.3); w.group.add(gun);
    const goon = { ...w, x, z, heading: 0, health: opts.boss ? 220 : 60, boss: !!opts.boss,
      shootT: range(this.rng, 0.5, 1.5), dead: false, name: opts.name || 'goon' };
    this.goons.push(goon);
    return goon;
  }

  clearGoons() {
    for (const g of this.goons) this.scene.remove(g.group);
    this.goons = [];
  }

  spawnPoliceCar() {
    const a = this.rng() * Math.PI * 2;
    const px = clamp(Math.cos(a) * 120, -320, 320), pz = clamp(Math.sin(a) * 120, -320, 320);
    const car = this.fleet.makeCar(px, pz, a, 0x1a1a1a, 'police');
    // white doors + light bar
    const doorMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
    for (const sx of [-1.06, 1.06]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 2.0), doorMat);
      door.position.set(sx, 0.85, -0.2); car.group.add(door);
    }
    const barR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 1 }));
    barR.position.set(-0.5, 1.95, -0.2); car.group.add(barR);
    const barB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x2244ff, emissiveIntensity: 1 }));
    barB.position.set(0.5, 1.95, -0.2); car.group.add(barB);
    car.lightBar = [barR, barB];
    this.policeCars.push(car);
    return car;
  }

  spawnHelicopter() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.6, 6),
      new THREE.MeshLambertMaterial({ color: 0x1a2a3a }));
    body.castShadow = true; g.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 5),
      new THREE.MeshLambertMaterial({ color: 0x1a2a3a }));
    tail.position.set(0, 0.3, -5); g.add(tail);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 0.7),
      new THREE.MeshLambertMaterial({ color: 0x111111 }));
    rotor.position.y = 1.2; g.add(rotor);
    const rotor2 = rotor.clone(); rotor2.rotation.y = Math.PI / 2; g.add(rotor2);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(7, 34, 16, 1, true),
      new THREE.MeshLambertMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.16, side: THREE.DoubleSide }));
    cone.rotation.x = Math.PI; cone.position.y = -17; g.add(cone);
    const spot = new THREE.SpotLight(0xfff2b0, 900, 90, 0.28, 0.4, 1.2);
    spot.position.set(0, -1, 0); g.add(spot); g.add(spot.target);
    spot.target.position.set(0, -34, 0);
    g.position.set(0, 46, 0);
    this.scene.add(g);
    this.heli = { group: g, rotor, rotor2, spot };
    return this.heli;
  }

  removeHelicopter() {
    if (!this.heli) return;
    this.scene.remove(this.heli.group);
    this.heli = null;
  }

  update(dt, player) {
    // ---- pedestrians -------------------------------------------------------
    for (const p of this.peds) {
      if (p.dead) continue;
      const dx = p.target.x - p.x, dz = p.target.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 2) { p.target = this.randomStrollTarget(p.x, p.z); continue; }
      const sp = p.fleeT > 0 ? 5.2 : p.speed;
      p.fleeT = Math.max(0, p.fleeT - dt);
      const want = Math.atan2(dx, dz);
      p.heading = angleLerp(p.heading, want, dt * 4);
      p.x += Math.sin(p.heading) * sp * dt;
      p.z += Math.cos(p.heading) * sp * dt;
      p.group.position.set(p.x, 0, p.z);
      p.group.rotation.y = p.heading;
      p.walkPhase += dt * sp * 3.4;
      const swing = Math.sin(p.walkPhase) * 0.55;
      p.legL.rotation.x = swing; p.legR.rotation.x = -swing;
      p.armL.rotation.x = -swing * 0.7; p.armR.rotation.x = swing * 0.7;
      for (const b of this.world.colliders) {
        const hit = resolveCircleVsBox(p.x, p.z, 0.6, b);
        if (hit) { p.x = hit.x; p.z = hit.z; p.target = this.randomStrollTarget(p.x, p.z); }
      }
    }
    // ---- police ------------------------------------------------------------
    const wantCount = this.wanted > 0 ? Math.min(this.wanted + 1, 4) : 0;
    while (this.policeCars.length < wantCount) this.spawnPoliceCar();
    while (this.policeCars.length > wantCount) {
      const c = this.policeCars.pop();
      this.fleet.remove(c);
    }
    this.flashT += dt;
    const flashOn = Math.floor(this.flashT * 6) % 2 === 0;
    for (const car of this.policeCars) {
      const dx = player.x - car.group.position.x, dz = player.z - car.group.position.z;
      const dist = Math.hypot(dx, dz);
      const wantHeading = Math.atan2(dx, dz);
      const steer = clamp(angleDiff(car.heading, wantHeading) * 1.4, -1, 1);
      const throttle = dist > 7 ? 1 : 0.4;
      this.fleet.drive(car, dt, throttle, steer);
      if (car.lightBar) {
        car.lightBar[0].material.emissiveIntensity = flashOn ? 2.2 : 0.2;
        car.lightBar[1].material.emissiveIntensity = flashOn ? 0.2 : 2.2;
      }
      if (dist < 4.6) {
        // ramming: hurt the player or their car
        if (player.inCar && player.car) {
          player.car.health -= 14 * dt;
          if (player.car.health <= 0) this.bus.emit('car-wrecked', { car: player.car });
        } else {
          this.bus.emit('damage-player', { amount: 12 * dt, source: 'police ram' });
        }
        car.speed *= 0.4;
      }
    }
    // ---- helicopter ---------------------------------------------------------
    if (this.wanted >= 3 && !this.heli) this.spawnHelicopter();
    if (this.wanted < 3 && this.heli) this.removeHelicopter();
    if (this.heli) {
      const h = this.heli.group;
      h.position.x = angleLerp(h.position.x, player.x + 14, dt * 0.5);
      h.position.z = angleLerp(h.position.z, player.z - 10, dt * 0.5);
      h.position.y = 46 + Math.sin(performance.now() / 900) * 2;
      h.rotation.y = Math.atan2(player.x - h.position.x, player.z - h.position.z);
      this.heli.rotor.rotation.y += dt * 22;
      this.heli.rotor2.rotation.y += dt * 22;
    }
    // ---- goons --------------------------------------------------------------
    for (const g of this.goons) {
      if (g.dead) continue;
      const dx = player.x - g.x, dz = player.z - g.z;
      const dist = Math.hypot(dx, dz);
      g.group.rotation.y = Math.atan2(dx, dz);
      g.shootT -= dt;
      if (dist < 55 && g.shootT <= 0) {
        g.shootT = range(this.rng, 0.9, 1.7);
        const from = new THREE.Vector3(g.x, 1.4, g.z);
        const to = new THREE.Vector3(player.x + range(this.rng, -1.5, 1.5), 1.2, player.z + range(this.rng, -1.5, 1.5));
        this.bus.emit('tracer', { from, to, enemy: true });
        this.bus.emit('gunshot', { x: g.x, z: g.z });
        if (this.rng() < (g.boss ? 0.42 : 0.26)) {
          this.bus.emit('damage-player', { amount: g.boss ? 9 : 6, source: g.name });
        }
      }
    }
  }

  // Damage every living goon/ped within radius of a point; returns the kills.
  blastDamage(x, z, radius, dmg) {
    const kills = [];
    for (const g of this.goons) {
      if (g.dead) continue;
      if (Math.hypot(g.x - x, g.z - z) < radius) {
        g.health -= dmg;
        if (g.health <= 0) { g.dead = true; g.group.rotation.x = -Math.PI / 2; g.group.position.y = 0.4; kills.push(g); }
      }
    }
    return kills;
  }

  livingGoons() { return this.goons.filter((g) => !g.dead); }
}
