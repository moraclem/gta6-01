// Costa Alba — shared constants, helpers and city layout.
// One clear job: every number and named place the other modules agree on.

export const CFG = {
  // City grid: avenues and streets every 80 units, roads 16 wide.
  half: 320,
  roadGap: 80,
  roadWidth: 16,
  block: 64,
  // Ocean and sand along the south edge (+Z).
  beachZ: 336,
  oceanZ: 368,
  // Gameplay tuning.
  walkSpeed: 7,
  runSpeed: 11,
  carTopSpeed: 46,
  carAccel: 26,
  maxHealth: 100,
  maxWanted: 5,
  saveKey: 'costa-alba-save-v1',
};

// --- tiny math helpers -------------------------------------------------
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function rand(a = 1, b) {
  if (b === undefined) return Math.random() * a;
  return a + Math.random() * (b - a);
}
export function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
export function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function dist2(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }
export function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export function fmtClock(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes) % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
export function fmtCash(n) { return '$' + Math.floor(n).toLocaleString('en-US'); }

// --- named places in Costa Alba (all invented) --------------------------
export const PLACES = {
  marasGarage: { x: -40, z: -40, name: "Mara's Garage" },
  docks: { x: 280, z: 200, name: 'Coral Docks' },
  bank: { x: 40, z: 40, name: 'Alba National Bank' },
  mansion: { x: -280, z: -280, name: "Kroll's Mansion" },
  beach: { x: 120, z: 320, name: 'Palma Verde Beach' },
  market: { x: -200, z: 120, name: 'Mercado Alba' },
  hotel: { x: 200, z: -200, name: 'Hotel Miramar' },
  airport: { x: -280, z: 200, name: 'Alba Airfield' },
  hospital: { x: 120, z: -120, name: 'St. Coral Hospital' },
  plaza: { x: 0, z: 0, name: 'Plaza del Sol' },
};

// Avenue / street lines (roads run along these coordinates).
export function roadLines() {
  const lines = [];
  for (let c = -320; c <= 320; c += CFG.roadGap) lines.push(c);
  return lines;
}

// Snap a point to the nearest road centre line.
export function nearestRoadCoord(v) {
  const lines = roadLines();
  let best = lines[0];
  for (const l of lines) if (Math.abs(l - v) < Math.abs(best - v)) best = l;
  return best;
}

// Is this point on a road (within the asphalt)?
export function onRoad(x, z) {
  const half = CFG.roadWidth / 2;
  for (const l of roadLines()) {
    if (Math.abs(x - l) < half || Math.abs(z - l) < half) return true;
  }
  return false;
}

// Random point on a road, for spawning traffic.
export function randomRoadPoint() {
  const lines = roadLines();
  const vertical = Math.random() < 0.5;
  const line = choice(lines);
  const along = rand(-CFG.half, CFG.half);
  return vertical ? { x: line, z: along } : { x: along, z: line };
}

// Palette — sun-soaked coastal city.
export const PALETTE = {
  sky: 0x87bfe8,
  sun: 0xfff2d0,
  asphalt: 0x3a3f46,
  sidewalk: 0x9aa0a3,
  sand: 0xe8d29a,
  ocean: 0x1e7fa8,
  grass: 0x5d8a4a,
  building: [0xe8dcc8, 0xd8c8b0, 0xc8b8a0, 0xb8c8d8, 0xe0b8a0, 0xf0e0c0, 0x98b8c8, 0xd0a0a0],
  car: [0xd83a2e, 0x2e6fd8, 0xf0c020, 0x30b060, 0xe8e8e8, 0x222226, 0x8a5fd0, 0xe07020],
  police: 0x1a2a4a,
  taxi: 0xf0c020,
};
