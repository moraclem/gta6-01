// Costa Alba — small shared helpers: seeded random, maths, canvas textures, event bus.
// Every module imports from here so the rest of the game stays free of duplicated code.
import * as THREE from 'three';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rng, lo, hi) { return lo + rng() * (hi - lo); }
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }

// Shortest signed difference between two headings, in radians.
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function angleLerp(a, b, t) { return a + angleDiff(a, b) * clamp(t, 0, 1); }
export function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// Draw on a canvas and hand back a Three.js texture ready to use on a mesh.
export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Tiny publish/subscribe bus so systems can react without importing each other.
export function makeBus() {
  const map = new Map();
  return {
    on(name, fn) {
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(fn);
    },
    emit(name, data) {
      const list = map.get(name);
      if (list) for (const fn of list) fn(data);
    },
  };
}

// Warm coastal palette shared by the city, the cars and the HUD.
export const PALETTE = {
  skyTop: 0x7ec8e8,
  skyBottom: 0xffd9a0,
  sun: 0xfff2cf,
  asphalt: 0x3a3f46,
  sidewalk: 0x9aa0a3,
  sand: 0xe8cf9e,
  sea: 0x1e7fa8,
  seaDeep: 0x0e5a80,
  building: ['#e8dcc8', '#d9c2a3', '#c9b8a6', '#b8c4c9', '#e0b48f', '#a8b8c4', '#d8a08a', '#c4b49a'],
  glass: ['#ffd76a', '#ffe9a8', '#8fc7e8', '#5a6a78'],
  carPaint: [0xc23b2e, 0x2e6fc2, 0xe8b73c, 0x3fae6a, 0x8a5fc2, 0xe8e8e8, 0x22262b, 0xd97b2e, 0x2ec2b8, 0xb83a6e],
  shirt: [0xe85d5d, 0x5da8e8, 0x7ed67e, 0xe8d25d, 0xc25de8, 0xffffff, 0x2b2b2b, 0xe88a5d],
};

// Push a circle (x, z, radius) out of an axis-aligned box collider, if it overlaps.
export function resolveCircleVsBox(px, pz, r, box) {
  const cx = clamp(px, box.x - box.hx, box.x + box.hx);
  const cz = clamp(pz, box.z - box.hz, box.z + box.hz);
  const dx = px - cx, dz = pz - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return { x: cx + (dx / d) * r, z: cz + (dz / d) * r, push: r - d };
  }
  // Centre inside the box: shove out along the smallest penetration axis.
  const ox = box.hx + r - Math.abs(px - box.x);
  const oz = box.hz + r - Math.abs(pz - box.z);
  if (ox < oz) return { x: box.x + (px >= box.x ? box.hx + r : -box.hx - r), z: pz, push: ox };
  return { x: px, z: box.z + (pz >= box.z ? box.hz + r : -box.hz - r), push: oz };
}
