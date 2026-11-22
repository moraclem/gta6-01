// Costa Alba — pedestrians and mission enemies.
// One clear job: people on the sidewalks, and rivals who shoot back.

import * as THREE from 'three';
import { CFG, choice, rand, randInt, clamp, dist2 } from './config.js';

const SHIRTS = [0xd83a2e, 0x2e6fd8, 0xf0c020, 0x30b060, 0x8a5fd0, 0xe07020, 0xe8e8e8, 0x40c0c0];
const SKINS = [0xf0c8a0, 0xc89060, 0x8a5a38, 0xe8b890];

function makePersonMesh(shirt, skin, armed) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const pantsMat = new THREE.MeshLambertMaterial({ color: choice([0x223044, 0x3a3a3a, 0x5a4a3a]) });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3), pantsMat);
  legs.position.y = 0.4;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.34), shirtMat);
  torso.position.y = 1.15;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skinMat);
  head.position.y = 1.78;
  head.castShadow = true;
  g.add(head);
  const armGeo = new THREE.BoxGeometry(0.16, 0.7, 0.16);
  const armL = new THREE.Mesh(armGeo, shirtMat);
  armL.position.set(-0.4, 1.15, 0);
  g.add(armL);
  const armR = new THREE.Mesh(armGeo, shirtMat);
  armR.position.set(0.4, 1.15, 0);
  g.add(armR);
  g.userData.armL = armL;
  g.userData.armR = armR;
  if (armed) {
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    gun.position.set(0.4, 1.0, 0.3);
    g.add(gun);
  }
  return g;
}

export class Ped {
  constructor(mesh, opts = {}) {
    this.mesh = mesh;
    this.x = opts.x || 0;
    this.z = opts.z || 0;
    this.heading = rand(0, Math.PI * 2);
    this.speed = rand(1.2, 2.4);
    this.health = opts.health || 100;
    this.enemy = !!opts.enemy;
    this.fleeing = false;
    this.target = null; // wander target
    this.shootTimer = rand(0.5, 1.5);
    this.walkPhase = rand(0, 6);
    this.dead = false;
    this.updateMesh();
  }

  updateMesh() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }

  damage(n) {
    this.health -= n;
    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = 0.3;
    }
    return this.dead;
  }
}

export class Pedestrians {
  constructor(G) {
    this.G = G;
    this.peds = [];
    this.enemies = [];
    for (let i = 0; i < 26; i++) this.spawnPed();
  }

  spawnPed(x, z) {
    const p = x === undefined ? this.G.city.randomWalkPoint() : { x, z };
    const mesh = makePersonMesh(choice(SHIRTS), choice(SKINS), false);
    this.G.scene.add(mesh);
    const ped = new Ped(mesh, { x: p.x, z: p.z });
    ped.target = this.G.city.randomWalkPoint();
    this.peds.push(ped);
    return ped;
  }

  spawnEnemy(x, z, opts = {}) {
    const mesh = makePersonMesh(opts.shirt || 0x8a2020, choice(SKINS), true);
    this.G.scene.add(mesh);
    const e = new Ped(mesh, { x, z, health: opts.health || 60, enemy: true });
    e.name = opts.name || 'Rival';
    this.enemies.push(e);
    return e;
  }

  clearEnemies() {
    for (const e of this.enemies) this.G.scene.remove(e.mesh);
    this.enemies = [];
  }

  // Player hit a pedestrian: they flee, and it is a crime.
  scareNearby(x, z, radius = 14) {
    for (const p of this.peds) {
      if (!p.dead && dist2(p.x, p.z, x, z) < radius) p.fleeing = true;
    }
  }

  update(dt) {
    const player = this.G.player;
    // Wandering pedestrians.
    for (const p of [...this.peds]) {
      if (p.dead) continue;
      const d = dist2(p.x, p.z, player.x, player.z);
      if (d > 380) {
        // Recycle far-away peds near the player.
        const np = this.G.city.randomWalkPoint();
        p.x = player.x + rand(-120, 120);
        p.z = player.z + rand(-120, 120);
        p.target = np;
      }
      if (p.fleeing) {
        // Run away from the player.
        const a = Math.atan2(p.x - player.x, p.z - player.z);
        p.heading = a;
        p.x += Math.sin(a) * 5 * dt;
        p.z += Math.cos(a) * 5 * dt;
        if (d > 40) p.fleeing = false;
      } else {
        if (!p.target || dist2(p.x, p.z, p.target.x, p.target.z) < 3) {
          p.target = this.G.city.randomWalkPoint();
        }
        const a = Math.atan2(p.target.x - p.x, p.target.z - p.z);
        let dh = a - p.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        p.heading += clamp(dh, -2.4 * dt, 2.4 * dt);
        p.x += Math.sin(p.heading) * p.speed * dt;
        p.z += Math.cos(p.heading) * p.speed * dt;
      }
      const fixed = this.G.city.collideCircle(p.x, p.z, 0.6);
      p.x = fixed.x;
      p.z = fixed.z;
      p.walkPhase += dt * 8;
      const swing = Math.sin(p.walkPhase) * 0.5;
      p.mesh.userData.armL.rotation.x = swing;
      p.mesh.userData.armR.rotation.x = -swing;
      p.updateMesh();
    }
    // Enemies: close in and shoot at the player.
    for (const e of [...this.enemies]) {
      if (e.dead) continue;
      const d = dist2(e.x, e.z, player.x, player.z);
      const a = Math.atan2(player.x - e.x, player.z - e.z);
      let dh = a - e.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      e.heading += clamp(dh, -3 * dt, 3 * dt);
      if (d > 14) {
        e.x += Math.sin(e.heading) * 4.2 * dt;
        e.z += Math.cos(e.heading) * 4.2 * dt;
      }
      e.shootTimer -= dt;
      if (e.shootTimer <= 0 && d < 42 && !player.dead) {
        e.shootTimer = rand(0.9, 1.8);
        this.G.audio.gunshot();
        // Inaccurate fire: closer = likelier to hit.
        if (Math.random() < clamp(0.5 - d / 90, 0.08, 0.45)) {
          player.damage(randInt(4, 9), 'enemy');
          this.G.hud.flashDamage();
        }
        this.G.effects.muzzle(e.x, 1.4, e.z);
      }
      const fixed = this.G.city.collideCircle(e.x, e.z, 0.6);
      e.x = fixed.x;
      e.z = fixed.z;
      e.updateMesh();
    }
  }
}
