// Costa Alba — boot: renderer, camera, input, the player character, the main
// loop and the glue between world, vehicles, people, combat, story, HUD and
// sound. This is the file index.html loads first.
import * as THREE from 'three';
import { makeBus, clamp, angleLerp, angleDiff, resolveCircleVsBox, mulberry32 } from './util.js';
import { buildWorld, CITY_HALF } from './world.js';
import { CarFleet } from './vehicles.js';
import { Crowd } from './people.js';
import { Combat } from './combat.js';
import { Story, MISSIONS } from './story.js';
import { Interface } from './interface.js';
import { SoundEngine } from './sound.js';
import { hasSave, saveGame, loadGame } from './persist.js';

const bus = makeBus();
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 30, 60);

const world = buildWorld(scene);
const fleet = new CarFleet(scene, world, bus);
const crowd = new Crowd(scene, world, fleet, bus);
const combat = new Combat(scene, bus, crowd, fleet);
const sound = new SoundEngine(bus);
const ui = new Interface(bus, world);

// ---- game state ------------------------------------------------------------
const state = {
  mode: 'menu', // menu | playing | paused | dead | win
  health: 100, cash: 250, wanted: 0,
  clockMin: 9 * 60, // 09:00
  x: -90, z: 120, heading: 0,
  inCar: false, car: null,
  camYaw: Math.PI, camPitch: 0.32,
  shakeT: 0, decayT: 0, walkPhase: 0,
  armed: true, won: false,
};

const hooks = {
  setWanted(n) { state.wanted = clamp(n, 0, 5); crowd.wanted = state.wanted; },
  addCash(n) { state.cash += n; },
  onWin() {
    state.won = true;
    state.mode = 'win';
    ui.showWin();
    bus.emit('sound', 'complete');
  },
};
const story = new Story(scene, bus, fleet, crowd, hooks);

// ---- the player: Dario "Daz" Ferrer ---------------------------------------
function buildPlayer() {
  const g = new THREE.Group();
  const teal = new THREE.MeshLambertMaterial({ color: 0x2e8a7a });
  const denim = new THREE.MeshLambertMaterial({ color: 0x2a3a5a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5a });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.9, 0.36), teal);
  torso.position.y = 1.15; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.44), skin);
  head.position.y = 1.82; head.castShadow = true; g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.5),
    new THREE.MeshLambertMaterial({ color: 0xc23b2e }));
  cap.position.y = 2.06; g.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.3),
    new THREE.MeshLambertMaterial({ color: 0xc23b2e }));
  brim.position.set(0, 2.0, 0.32); g.add(brim);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.85, 0.28), denim);
  legL.position.set(-0.17, 0.42, 0); legL.castShadow = true; g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.17; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.22), teal);
  armL.position.set(-0.45, 1.15, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.45; g.add(armR);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.55),
    new THREE.MeshLambertMaterial({ color: 0x111111 }));
  gun.position.set(0.45, 0.85, 0.3); g.add(gun);
  scene.add(g);
  return { group: g, legL, legR, armL, armR, gun };
}
const player = buildPlayer();
player.group.position.set(state.x, 0, state.z);

// ---- traffic + parked cars + pedestrians -----------------------------------
fleet.spawnParked(10);
fleet.spawnTraffic(14);
crowd.spawnPedestrians(26);

// ---- input -----------------------------------------------------------------
const keys = new Set();
let dragging = false, lastPX = 0, lastPY = 0, downX = 0, downY = 0;
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  sound.init();
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (e.code === 'KeyM') startNextMission();
  if (e.code === 'KeyE') tryEnterExitCar();
  if (e.code === 'KeyR') combat.reload();
  if (e.code === 'Digit1') sound.setStation('funk');
  if (e.code === 'Digit2') sound.setStation('synth');
  if (e.code === 'Digit3') sound.setStation('latin');
  if (e.code === 'Digit0') sound.setStation(null);
  if (e.code === 'KeyF') tryShoot();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
renderer.domElement.addEventListener('mousedown', (e) => {
  dragging = true; lastPX = e.clientX; lastPY = e.clientY; downX = e.clientX; downY = e.clientY;
  sound.init();
});
window.addEventListener('mouseup', (e) => {
  if (dragging && Math.hypot(e.clientX - downX, e.clientY - downY) < 6 && state.mode === 'playing' && !state.inCar) {
    tryShoot();
  }
  dragging = false;
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  state.camYaw -= (e.clientX - lastPX) * 0.005;
  state.camPitch = clamp(state.camPitch + (e.clientY - lastPY) * 0.004, 0.06, 1.15);
  lastPX = e.clientX; lastPY = e.clientY;
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- actions ---------------------------------------------------------------
function tryShoot() {
  if (state.mode !== 'playing' || state.inCar) return;
  camera.getWorldDirection(_tmpDir);
  const origin = player.group.position.clone().add(new THREE.Vector3(0, 1.5, 0));
  // aim through the centre of the screen: point far ahead of the camera
  const aimPoint = camera.position.clone().addScaledVector(_tmpDir, 60);
  const dir = aimPoint.sub(origin).normalize();
  combat.shoot(origin, dir);
}
const _tmpDir = new THREE.Vector3();
const _tmpV = new THREE.Vector3();

function tryEnterExitCar() {
  if (state.mode !== 'playing') return;
  if (state.inCar) {
    // step out beside the car
    const c = state.car;
    c.speed = 0;
    c.kind = 'parked';
    const side = new THREE.Vector3(Math.cos(c.heading), 0, -Math.sin(c.heading));
    state.x = c.group.position.x + side.x * 3.2;
    state.z = c.group.position.z + side.z * 3.2;
    state.heading = c.heading;
    state.inCar = false; state.car = null;
    player.group.visible = true;
    player.group.position.set(state.x, 0, state.z);
    bus.emit('message', 'Out of the car.');
    return;
  }
  const car = fleet.nearestCar(state.x, state.z, 4.5);
  if (!car) { bus.emit('message', 'No car close enough — walk up to one and press E.'); return; }
  const stolen = car.kind === 'parked' || car.kind === 'traffic';
  state.inCar = true; state.car = car;
  car.kind = 'player';
  player.group.visible = false;
  if (stolen) {
    hooks.setWanted(state.wanted + 1);
    bus.emit('message', `Stole the ${car.name}! The cops noticed — wanted level up.`);
    bus.emit('sound', 'pickup');
  } else {
    bus.emit('message', `Driving the ${car.name}.`);
  }
}

function startNextMission() {
  if (state.mode !== 'playing') return;
  if (story.current) {
    bus.emit('message', `Current job: ${story.objectiveText()}`);
    return;
  }
  const next = state.won ? 0 : (story.index < 0 ? 0 : story.index);
  story.startMission(Math.min(next, MISSIONS.length - 1));
}

function togglePause() {
  if (state.mode === 'playing') {
    state.mode = 'paused'; ui.showPause();
  } else if (state.mode === 'paused') {
    state.mode = 'playing'; ui.hidePause();
  }
}

function die() {
  state.mode = 'dead';
  state.cash = Math.max(0, state.cash - 250);
  if (story.current) story.failMission('Daz went down');
  ui.showDead();
  bus.emit('sound', 'fail');
}

function respawn() {
  const h = world.landmarks.hospital;
  state.x = h.x + 20; state.z = h.z + 20;
  state.health = 100;
  hooks.setWanted(0);
  if (state.inCar && state.car) { state.car.kind = 'parked'; state.car = null; state.inCar = false; }
  player.group.visible = true;
  player.group.position.set(state.x, 0, state.z);
  ui.hideDead();
  state.mode = 'playing';
  bus.emit('message', 'Patched up at St. Coral Hospital. Back on the streets.');
}

function doSave() {
  const ok = saveGame({
    cash: state.cash, health: state.health,
    missionIndex: story.current ? story.index : (state.won ? MISSIONS.length : 0),
    x: state.x, z: state.z, heading: state.heading, clockMin: state.clockMin,
  });
  bus.emit('message', ok ? 'Game saved.' : 'Save failed — storage unavailable.');
  return ok;
}

function startGame(fresh) {
  let loaded = null;
  if (!fresh) loaded = loadGame();
  if (loaded) {
    state.cash = loaded.cash; state.health = loaded.health;
    state.x = loaded.x; state.z = loaded.z; state.heading = loaded.heading || 0;
    state.clockMin = loaded.clockMin || 540;
    bus.emit('message', 'Save loaded. Welcome back to Costa Alba.');
  } else {
    state.cash = 250; state.health = 100; state.x = -90; state.z = 120; state.clockMin = 540;
  }
  state.wanted = 0; crowd.wanted = 0;
  state.mode = 'playing';
  player.group.visible = true;
  player.group.position.set(state.x, 0, state.z);
  ui.hideMenu();
  sound.init();
  if (loaded && loaded.missionIndex > 0 && loaded.missionIndex < MISSIONS.length) {
    story.startMission(loaded.missionIndex);
  }
}

// ---- UI wiring ---------------------------------------------------------------
ui.on('newGame', () => startGame(true));
ui.on('continueGame', () => startGame(false));
ui.on('resume', () => togglePause());
ui.on('save', () => { doSave(); });
ui.on('quitToMenu', () => {
  state.mode = 'menu'; ui.hidePause(); ui.showMenu(hasSave());
});
ui.on('respawn', respawn);
ui.on('freeRoam', () => { ui.hideWin(); state.mode = 'playing'; });

bus.on('damage-player', ({ amount }) => {
  if (state.mode !== 'playing') return;
  state.health -= amount;
  if (state.health <= 0) { state.health = 0; die(); }
});
bus.on('car-wrecked', ({ car }) => {
  if (state.car === car) {
    bus.emit('message', 'Your car is wrecked! Bail out!');
    tryEnterExitCar();
  }
  bus.emit('sound', 'crash');
});
bus.on('crash', () => { state.shakeT = 0.25; bus.emit('sound', 'crash'); });
bus.on('goon-down', () => {
  state.cash += 25;
  bus.emit('message', 'Target down. +$25 lifted off them.');
});

// ---- per-frame updates -------------------------------------------------------
function updatePlayer(dt) {
  const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const speed = sprint ? 10 : 6;
  let mx = 0, mz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) mz += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) mz -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  if (mx !== 0 || mz !== 0) {
    const len = Math.hypot(mx, mz); mx /= len; mz /= len;
    // movement is relative to the camera yaw
    const sy = Math.sin(state.camYaw), cy = Math.cos(state.camYaw);
    const wx = mx * cy - mz * sy;
    const wz = -mx * sy - mz * cy;
    state.x += wx * speed * dt;
    state.z += wz * speed * dt;
    state.heading = angleLerp(state.heading, Math.atan2(wx, wz), dt * 10);
    state.walkPhase += dt * speed * 1.6;
    const swing = Math.sin(state.walkPhase) * 0.6;
    player.legL.rotation.x = swing; player.legR.rotation.x = -swing;
    player.armL.rotation.x = -swing * 0.7; player.armR.rotation.x = swing * 0.7;
  } else {
    player.legL.rotation.x *= 0.8; player.legR.rotation.x *= 0.8;
    player.armL.rotation.x *= 0.8; player.armR.rotation.x *= 0.8;
  }
  state.x = clamp(state.x, -420, 440);
  state.z = clamp(state.z, -420, 440);
  for (const b of world.colliders) {
    const hit = resolveCircleVsBox(state.x, state.z, 0.7, b);
    if (hit) { state.x = hit.x; state.z = hit.z; }
  }
  // soft push from pedestrians
  for (const p of crowd.peds) {
    const dx = state.x - p.x, dz = state.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.01 && d < 1.1) { state.x += (dx / d) * 0.3; state.z += (dz / d) * 0.3; }
  }
  player.group.position.set(state.x, 0, state.z);
  player.group.rotation.y = state.heading;
}

function updateDriving(dt) {
  const car = state.car;
  if (!car) { state.inCar = false; return; }
  const throttle = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0)
    - (keys.has('KeyS') || keys.has('ArrowDown') ? 0.7 : 0);
  const steer = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0)
    - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
  fleet.drive(car, dt, throttle, steer);
  state.x = car.group.position.x;
  state.z = car.group.position.z;
  state.heading = car.heading;
  // steering follows the car when driving
  state.camYaw = angleLerp(state.camYaw, car.heading + Math.PI, dt * 1.2);
}

function updateCamera(dt) {
  const tx = state.x, tz = state.z;
  const dist = state.inCar ? 13 : 8.5;
  const height = state.inCar ? 4.5 : 3.2;
  const yaw = state.camYaw, pitch = state.camPitch;
  const cx = tx + Math.sin(yaw) * Math.cos(pitch) * dist;
  const cz = tz + Math.cos(yaw) * Math.cos(pitch) * dist;
  const cy = height + Math.sin(pitch) * dist;
  camera.position.set(cx, Math.max(cy, 1.4), cz);
  if (state.shakeT > 0) {
    state.shakeT -= dt;
    camera.position.x += (Math.random() - 0.5) * 0.3;
    camera.position.y += (Math.random() - 0.5) * 0.3;
  }
  camera.lookAt(tx, state.inCar ? 1.6 : 1.5, tz);
  // keep the sun's shadow box on the player
  world.sun.position.set(tx + 180, 260, tz + 120);
  world.sun.target.position.set(tx, 0, tz);
}

function updateWanted(dt) {
  crowd.wanted = state.wanted;
  if (state.wanted === 0) { state.decayT = 0; return; }
  const nearPolice = crowd.policeCars.some((c) =>
    Math.hypot(c.group.position.x - state.x, c.group.position.z - state.z) < 70);
  if (nearPolice) { state.decayT = 0; return; }
  state.decayT += dt;
  if (state.decayT > 8) {
    state.decayT = 0;
    hooks.setWanted(state.wanted - 1);
    bus.emit('message', 'You lost the cops. Wanted level dropping.');
  }
}

// ---- main loop ---------------------------------------------------------------
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (state.mode === 'playing') {
    state.clockMin += dt * 1.5; // a game day passes in about 16 real minutes
    if (state.inCar) updateDriving(dt); else updatePlayer(dt);
    fleet.updateTraffic(dt, { x: state.x, z: state.z });
    crowd.update(dt, { x: state.x, z: state.z, inCar: state.inCar, car: state.car });
    combat.update(dt);
    story.update(dt, { x: state.x, z: state.z, inCar: state.inCar, car: state.car });
    updateWanted(dt);
    sound.update(dt, {
      speedKmh: state.inCar && state.car ? Math.abs(state.car.speed) * 3.6 : 0,
      inCar: state.inCar, wanted: state.wanted,
    });
    ui.update({
      health: state.health, cash: state.cash, wanted: state.wanted,
      speedKmh: state.inCar && state.car ? Math.abs(state.car.speed) * 3.6 : 0,
      inCar: state.inCar, ammo: combat.ammo, mag: combat.mag,
      clockMin: state.clockMin, objective: story.objectiveText(),
      timer: story.step?.kind === 'timed' ? story.timer : 0,
      x: state.x, z: state.z, heading: state.heading,
      police: crowd.policeCars.map((c) => ({ x: c.group.position.x, z: c.group.position.z })),
      beacon: story.beaconPos(),
      goons: crowd.livingGoons().map((g) => ({ x: g.x, z: g.z })),
      station: sound.stationName(), armed: !state.inCar,
    });
  }
  world.update(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
}
animate();

// ---- screenshot staging (?scene=cover|chase|foot|mission) --------------------
// The game itself stages a lively moment so its screenshots show the city,
// the HUD, the wanted level and a mission at once. Normal play ignores this.
function stageScene(kind) {
  startGame(true);
  const putInCar = (x, z, heading, color) => {
    const car = fleet.makeCar(x, z, heading, color, 'parked', 'Comet GT');
    state.x = x; state.z = z; state.heading = heading;
    state.inCar = true; state.car = car; car.kind = 'player';
    player.group.visible = false;
  };
  if (kind === 'cover') {
    state.cash = 12500;
    putInCar(0, 96, 0, 0xc23b2e);
    state.car.speed = 10;
    hooks.setWanted(2);
    story.startMission(5); // Grand Theft Alba — beacon on the bank
    // two interceptors right behind the player, one more joins from the grid
    const p1 = crowd.spawnPoliceCar();
    p1.group.position.set(-2.5, 0, 62); p1.heading = 0;
    const p2 = crowd.spawnPoliceCar();
    p2.group.position.set(3, 0, 70); p2.heading = 0;
    const t1 = fleet.makeCar(2, 150, 0, 0x2e6fc2, 'traffic');
    t1.axis = 'z'; t1.dir = 1; t1.road = 0; t1.targetSpeed = 11;
    const t2 = fleet.makeCar(-2, 215, Math.PI, 0xe8b73c, 'traffic');
    t2.axis = 'z'; t2.dir = -1; t2.road = 0; t2.targetSpeed = 11;
  } else if (kind === 'chase') {
    state.cash = 8300;
    putInCar(0, 300, Math.PI / 2, 0x2e6fc2);
    state.car.speed = 24;
    hooks.setWanted(3);
    story.startMission(6); // Beach Party Bust — beacon on the beach road
    story.stepIdx = 1; story.enterStep(); // courier car already out ahead
    const p1 = crowd.spawnPoliceCar();
    p1.group.position.set(-40, 0, 300); p1.heading = Math.PI / 2;
    const p2 = crowd.spawnPoliceCar();
    p2.group.position.set(150, 0, 300); p2.heading = -Math.PI / 2; // roadblock ahead
  } else if (kind === 'foot') {
    state.x = -24; state.z = 252; state.heading = Math.PI;
    state.camYaw = 0.15; state.camPitch = 0.32;
    player.group.position.set(state.x, 0, state.z);
    hooks.setWanted(1);
    story.startMission(2); // Debt Collector — goons at the mercado
    story.stepIdx = 1; story.enterStep();
  } else if (kind === 'mission') {
    state.x = 318; state.z = 150; state.heading = Math.PI / 2;
    state.camYaw = -Math.PI / 2; state.camPitch = 0.4;
    player.group.position.set(state.x, 0, state.z);
    hooks.setWanted(2);
    story.startMission(4); // Turbulence — dock shootout
    story.stepIdx = 1; story.enterStep();
  }
  updateCamera(0.016);
}

// ---- debug handle for play-testing -------------------------------------------
window.__costa = {
  state, story, fleet, crowd, combat, MISSIONS,
  startGame, teleport(x, z) {
    state.x = x; state.z = z;
    if (!state.inCar) player.group.position.set(x, 0, z);
  },
  setWanted(n) { hooks.setWanted(n); },
  setHealth(n) { state.health = n; },
  shoot() { tryShoot(); },
  enterCar() { tryEnterExitCar(); },
};

// ---- go ----------------------------------------------------------------------
const params = new URLSearchParams(window.location.search);
const sceneKind = params.get('scene');
if (sceneKind) {
  stageScene(sceneKind);
} else {
  ui.showMenu(hasSave());
  bus.emit('message', 'Welcome to Costa Alba.');
}
