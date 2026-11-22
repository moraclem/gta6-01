// Costa Alba — the player on foot and behind the wheel.
// One clear job: movement, camera-relative controls, combat, entering cars.

import * as THREE from 'three';
import { CFG, clamp, dist2 } from './config.js';

function makePlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x2e6fd8 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc89060 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x223044 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.85, 0.32), pants);
  legs.position.y = 0.42;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.8, 0.36), jacket);
  torso.position.y = 1.2;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), skin);
  head.position.y = 1.85;
  head.castShadow = true;
  g.add(head);
  // Daz wears a white tee under the jacket and a cap.
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 10), new THREE.MeshLambertMaterial({ color: 0xd83a2e }));
  cap.position.y = 2.02;
  g.add(cap);
  const armGeo = new THREE.BoxGeometry(0.16, 0.72, 0.16);
  const armL = new THREE.Mesh(armGeo, jacket);
  armL.position.set(-0.42, 1.2, 0);
  g.add(armL);
  const armR = new THREE.Mesh(armGeo, jacket);
  armR.position.set(0.42, 1.2, 0);
  g.add(armR);
  g.userData.armL = armL;
  g.userData.armR = armR;
  // Pistol in the right hand when armed.
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.55), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  gun.position.set(0.42, 0.95, 0.3);
  g.add(gun);
  g.userData.gun = gun;
  return g;
}

export class Player {
  constructor(G) {
    this.G = G;
    this.x = -40;
    this.z = -60;
    this.heading = 0;
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.camDist = 9;
    this.health = CFG.maxHealth;
    this.ammo = 60;
    this.armed = true;
    this.inCar = false;
    this.car = null;
    this.dead = false;
    this.walkPhase = 0;
    this.fireCooldown = 0;
    this.mesh = makePlayerMesh();
    this.mesh.castShadow = true;
    G.scene.add(this.mesh);
    this.updateMesh();
  }

  updateMesh() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    this.mesh.visible = !this.inCar;
  }

  reset(x, z) {
    this.x = x;
    this.z = z;
    this.health = CFG.maxHealth;
    this.dead = false;
    this.inCar = false;
    this.car = null;
    this.mesh.rotation.x = 0;
    this.mesh.position.y = 0;
    this.updateMesh();
  }

  damage(n, source) {
    if (this.dead || this.G.state.mode !== 'playing') return;
    this.health -= n;
    this.G.hud.flashDamage();
    if (this.health <= 0) {
      this.health = 0;
      this.die(source);
    }
  }

  die(source) {
    this.dead = true;
    this.G.audio.failSound();
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.3;
    this.G.onPlayerDeath(source);
  }

  enterCar(car) {
    if (!car) return false;
    car.isPlayer = true;
    car.parked = false;
    this.inCar = true;
    this.car = car;
    this.G.audio.blip(440, 0.1);
    this.updateMesh();
    if (!car.stolen) {
      car.stolen = true;
      // Stealing a car the player does not own is a crime — unless it is
      // the player's own mission car (marked free).
      if (!car.free) {
        this.G.addWanted(1, 'stole a car');
        this.G.hud.message(`Stole a ${car.name} — the Alba PD noticed.`, 'crime');
      }
    }
    return true;
  }

  exitCar() {
    if (!this.car) return;
    const car = this.car;
    car.isPlayer = false;
    this.inCar = false;
    this.car = null;
    // Step out to the side of the car.
    this.x = car.x + Math.cos(car.heading) * 2.4;
    this.z = car.z - Math.sin(car.heading) * 2.4;
    const fixed = this.G.city.collideCircle(this.x, this.z, 0.7);
    this.x = fixed.x;
    this.z = fixed.z;
    this.heading = car.heading;
    this.updateMesh();
  }

  // Fire the pistol toward the camera aim point.
  shoot() {
    if (this.fireCooldown > 0 || this.ammo <= 0 || this.inCar) return;
    this.fireCooldown = 0.22;
    this.ammo -= 1;
    this.G.audio.gunshot();
    const cam = this.G.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const origin = new THREE.Vector3(this.x, 1.5, this.z);
    // Aim assist: nearest enemy or ped near the ray within 60 units.
    let best = null;
    let bestScore = 0.12;
    const targets = [...this.G.peds.enemies, ...this.G.peds.peds];
    for (const t of targets) {
      if (t.dead) continue;
      const to = new THREE.Vector3(t.x - origin.x, 1.2 - origin.y, t.z - origin.z);
      const d = to.length();
      if (d > 60) continue;
      to.normalize();
      const dot = to.dot(dir);
      if (dot > bestScore) { bestScore = dot; best = { t, d }; }
    }
    let hitX, hitY, hitZ;
    if (best) {
      hitX = best.t.x; hitY = 1.2; hitZ = best.t.z;
      const wasEnemy = best.t.enemy;
      const killed = best.t.damage(34);
      this.G.effects.blood(hitX, hitY, hitZ);
      if (killed) {
        if (wasEnemy) {
          this.G.missions.onEnemyKilled(best.t);
          this.G.hud.message('Rival down.', 'good');
        } else {
          this.G.addWanted(1, 'hurt a pedestrian');
          this.G.peds.scareNearby(hitX, hitZ);
          this.G.hud.message('You hit a civilian — witnesses called the police!', 'crime');
        }
      }
    } else {
      hitX = origin.x + dir.x * 40;
      hitY = Math.max(0.1, origin.y + dir.y * 40);
      hitZ = origin.z + dir.z * 40;
    }
    this.G.effects.muzzle(this.x + Math.sin(this.heading) * 0.5, 1.4, this.z + Math.cos(this.heading) * 0.5);
    this.G.effects.tracer(origin.x, origin.y, origin.z, hitX, hitY, hitZ);
    if (this.ammo === 0) this.G.hud.message('Out of ammo — find the gun shop on Mercado Row.', 'warn');
  }

  update(dt, input) {
    if (this.dead) return;
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);

    if (this.inCar && this.car) {
      const car = this.car;
      const throttle = (input.forward ? 1 : 0) + (input.back ? -1 : 0);
      const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
      const before = { x: car.x, z: car.z };
      car.drive(dt, throttle, steer);
      const fixed = this.G.city.collideCircle(car.x, car.z, 2.3);
      if (fixed.x !== car.x || fixed.z !== car.z) {
        if (Math.abs(car.speed) > 12) {
          this.G.audio.crash();
          this.G.effects.sparks(car.x, 0.8, car.z);
        }
        car.speed *= 0.4;
        car.x = fixed.x;
        car.z = fixed.z;
        car.updateMesh();
      }
      // Running over a pedestrian is a crime.
      for (const p of this.G.peds.peds) {
        if (!p.dead && dist2(car.x, car.z, p.x, p.z) < 2.2 && Math.abs(car.speed) > 3) {
          p.damage(200);
          this.G.addWanted(1, 'ran over a pedestrian');
          this.G.peds.scareNearby(car.x, car.z);
          this.G.audio.crash();
        }
      }
      // Bumping traffic cars.
      for (const o of [...this.G.traffic.cars, ...this.G.traffic.police]) {
        if (o === car) continue;
        const d = dist2(car.x, car.z, o.x, o.z);
        if (d < 3.6 && Math.abs(car.speed) > 4) {
          o.x += (o.x - car.x) * 0.4;
          o.z += (o.z - car.z) * 0.4;
          car.speed *= 0.6;
          this.G.audio.crash();
          this.G.effects.sparks(car.x, 0.8, car.z);
        }
      }
      this.G.audio.setEngine(Math.abs(car.speed) / CFG.carTopSpeed, true);
      this.x = car.x;
      this.z = car.z;
      this.heading = car.heading;
      return;
    }

    // On foot: camera-relative movement.
    const speed = input.run ? CFG.runSpeed : CFG.walkSpeed;
    let mx = 0;
    let mz = 0;
    if (input.forward) { mx += Math.sin(this.camYaw); mz += Math.cos(this.camYaw); }
    if (input.back) { mx -= Math.sin(this.camYaw); mz -= Math.cos(this.camYaw); }
    if (input.left) { mx -= Math.cos(this.camYaw); mz += Math.sin(this.camYaw); }
    if (input.right) { mx += Math.cos(this.camYaw); mz -= Math.sin(this.camYaw); }
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len; mz /= len;
      this.x += mx * speed * dt;
      this.z += mz * speed * dt;
      this.heading = Math.atan2(mx, mz);
      this.walkPhase += dt * (input.run ? 13 : 9);
      const swing = Math.sin(this.walkPhase) * 0.55;
      this.mesh.userData.armL.rotation.x = swing;
      this.mesh.userData.armR.rotation.x = -swing;
    } else {
      this.mesh.userData.armL.rotation.x *= 0.8;
      this.mesh.userData.armR.rotation.x *= 0.8;
    }
    const fixed = this.G.city.collideCircle(this.x, this.z, 0.7);
    this.x = fixed.x;
    this.z = fixed.z;
    this.G.audio.setEngine(0, false);
    this.updateMesh();
  }
}
