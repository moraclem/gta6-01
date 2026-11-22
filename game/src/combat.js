// Costa Alba — combat: the player's pistol with a touch of aim assist, tracers,
// muzzle flash and hit feedback. Hit tests are done against the shot line, so
// they stay cheap with dozens of people and cars on screen.
import * as THREE from 'three';
import { clamp } from './util.js';

const MAG = 12;
const RANGE = 90;

export class Combat {
  constructor(scene, bus, crowd, fleet) {
    this.scene = scene; this.bus = bus; this.crowd = crowd; this.fleet = fleet;
    this.ammo = MAG; this.mag = MAG;
    this.cooldown = 0;
    this.tracers = [];
    this.flash = new THREE.PointLight(0xffe9a8, 0, 18, 1.5);
    this.scene.add(this.flash);
    this.flashT = 0;
    this.lineMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true });
  }

  canShoot() { return this.cooldown <= 0 && this.ammo > 0; }

  reload() {
    if (this.ammo === this.mag) return false;
    this.ammo = this.mag;
    this.bus.emit('message', 'Magazine reloaded — 12 rounds.');
    this.bus.emit('sound', 'reload');
    return true;
  }

  // Aim assist: if a living goon sits just off the aim line, bend the shot to it.
  assist(origin, dir) {
    let best = null, bestAngle = 0.12; // ~7 degrees of help
    for (const g of this.crowd.goons) {
      if (g.dead) continue;
      const to = new THREE.Vector3(g.x - origin.x, 1.2 - origin.y, g.z - origin.z);
      const dist = to.length();
      if (dist > RANGE) continue;
      to.normalize();
      const angle = dir.angleTo(to);
      if (angle < bestAngle) { bestAngle = angle; best = new THREE.Vector3(g.x, 1.2, g.z); }
    }
    if (!best) return dir;
    const fixed = best.clone().sub(origin).normalize();
    return fixed;
  }

  // Fire one round along dir from origin. Returns what (if anything) it hit.
  shoot(origin, dir) {
    if (!this.canShoot()) {
      if (this.ammo <= 0) this.bus.emit('sound', 'dryfire');
      return null;
    }
    this.ammo--;
    this.cooldown = 0.22;
    const aim = this.assist(origin, dir.clone());
    this.bus.emit('gunshot', { x: origin.x, z: origin.z });
    this.bus.emit('sound', 'shot');
    this.flash.position.copy(origin);
    this.flash.intensity = 60;
    this.flashT = 0.07;

    // Walk the line in 1 m steps: first a wall, then a goon, then a car wins.
    let end = origin.clone().addScaledVector(aim, RANGE);
    let hit = null;
    const step = new THREE.Vector3();
    for (let d = 1; d <= RANGE; d += 1) {
      step.copy(origin).addScaledVector(aim, d);
      if (Math.abs(step.x) > 430 || Math.abs(step.z) > 430) { end.copy(step); break; }
      let blocked = false;
      for (const b of this.crowd.world.colliders) {
        if (Math.abs(step.x - b.x) < b.hx && Math.abs(step.z - b.z) < b.hz && step.y < 60) { blocked = true; break; }
      }
      if (blocked) { end.copy(step); hit = { kind: 'wall', point: step.clone() }; break; }
    }
    if (!hit) {
      // nearest goon whose centre passes close to the line
      let bestG = null, bestD = 1.4, bestAlong = Infinity;
      for (const g of this.crowd.goons) {
        if (g.dead) continue;
        const to = new THREE.Vector3(g.x - origin.x, 1.2 - origin.y, g.z - origin.z);
        const along = to.dot(aim);
        if (along < 0 || along > RANGE) continue;
        const perp = to.clone().addScaledVector(aim, -along).length();
        if (perp < bestD && along < bestAlong) { bestD = perp; bestAlong = along; bestG = g; }
      }
      if (bestG) {
        end.copy(origin).addScaledVector(aim, bestAlong);
        hit = { kind: 'goon', goon: bestG, point: end.clone() };
      } else {
        // cars are wide targets
        let bestC = null, bestCD = 2.6, bestCAlong = Infinity;
        for (const c of this.fleet.cars) {
          if (c.dead) continue;
          const to = new THREE.Vector3(c.group.position.x - origin.x, 0.9 - origin.y, c.group.position.z - origin.z);
          const along = to.dot(aim);
          if (along < 0 || along > RANGE) continue;
          const perp = to.clone().addScaledVector(aim, -along).length();
          if (perp < bestCD && along < bestCAlong) { bestCD = perp; bestCAlong = along; bestC = c; }
        }
        if (bestC) {
          end.copy(origin).addScaledVector(aim, bestCAlong);
          hit = { kind: 'car', car: bestC, point: end.clone() };
        }
      }
    }
    this.addTracer(origin, end);
    if (hit?.kind === 'goon') {
      hit.goon.health -= 34;
      this.bus.emit('sound', 'hit');
      if (hit.goon.health <= 0) {
        hit.goon.dead = true;
        hit.goon.group.rotation.x = -Math.PI / 2;
        hit.goon.group.position.y = 0.4;
        this.bus.emit('goon-down', { goon: hit.goon });
      }
    }
    if (hit?.kind === 'car') {
      hit.car.health -= 20;
      this.bus.emit('sound', 'hit');
      if (hit.car.health <= 0 && !hit.car.dead) {
        hit.car.dead = true;
        this.bus.emit('car-wrecked', { car: hit.car });
      }
    }
    return hit;
  }

  addTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, this.lineMat.clone());
    line.material.opacity = 0.9;
    this.scene.add(line);
    this.tracers.push({ line, life: 0.12 });
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flash.intensity = 0;
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = clamp(t.life / 0.12, 0, 1) * 0.9;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }
}
