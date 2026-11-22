// Costa Alba — cheap particle effects: muzzle flashes, tracers, blood, sparks.
// One clear job: short-lived meshes that sell the action, then clean up.

import * as THREE from 'three';

export class Effects {
  constructor(G) {
    this.G = G;
    this.particles = []; // {mesh, life, vel}
  }

  add(mesh, life, vel = null) {
    this.G.scene.add(mesh);
    this.particles.push({ mesh, life, maxLife: life, vel });
  }

  muzzle(x, y, z) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.95 })
    );
    m.position.set(x, y, z);
    this.add(m, 0.07);
  }

  tracer(x1, y1, z1, x2, y2, z2) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x1, y1, z1),
      new THREE.Vector3(x2, y2, z2),
    ]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 })
    );
    this.add(line, 0.09);
  }

  blood(x, y, z) {
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.12),
        new THREE.MeshBasicMaterial({ color: 0xa01818 })
      );
      m.position.set(x, y, z);
      this.add(m, 0.5, new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4));
    }
  }

  sparks(x, y, z) {
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.1, 0.1),
        new THREE.MeshBasicMaterial({ color: 0xffc040 })
      );
      m.position.set(x, y, z);
      this.add(m, 0.4, new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 5, (Math.random() - 0.5) * 8));
    }
  }

  update(dt) {
    for (const p of [...this.particles]) {
      p.life -= dt;
      if (p.vel) {
        p.mesh.position.x += p.vel.x * dt;
        p.mesh.position.y += p.vel.y * dt - 4 * dt * dt;
        p.mesh.position.z += p.vel.z * dt;
      }
      if (p.mesh.material && p.mesh.material.transparent) {
        p.mesh.material.opacity = Math.max(0, p.life / p.maxLife);
      }
      if (p.life <= 0) {
        this.G.scene.remove(p.mesh);
        if (p.mesh.geometry) p.mesh.geometry.dispose();
        this.particles = this.particles.filter((q) => q !== p);
      }
    }
  }
}
