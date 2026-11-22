// Costa Alba — boot, game loop, camera, input, wanted system, screens.
// One clear job: wire every system together and run the game.

import * as THREE from 'three';
import { CFG, PLACES, randomRoadPoint, nearestRoadCoord } from './config.js';
import { City } from './city.js';
import { Traffic } from './vehicles.js';
import { Pedestrians } from './pedestrians.js';
import { Player } from './player.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import { Effects } from './effects.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';

const TITLE = 'Costa Alba';

class Game {
  constructor() {
    this.state = {
      mode: 'menu', // menu | playing | paused | dead | win
      cash: 0,
      wanted: 0,
      heat: 0,
      clockMinutes: 9 * 60 + 15, // 09:15, a bright morning
      lastCrimeAt: -100,
    };
    this.time = 0;
    this.heat = 0;
    this.input = { forward: false, back: false, left: false, right: false, run: false };
    this.dragging = false;
    this.deathTimer = 0;
    this.shotMode = new URLSearchParams(location.search).get('shot') || null;
    this.shotReady = false;
    this.shotCam = null; // fixed camera for staged screenshots
  }

  boot() {
    const canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);
    this.camera.position.set(0, 30, -80);

    // The shared context every system receives.
    this.config = { randomRoadPoint, nearestRoadCoord };
    this.audio = new AudioEngine();
    this.city = new City(this.scene);
    this.effects = new Effects(this);
    this.traffic = new Traffic(this);
    this.peds = new Pedestrians(this);
    this.player = new Player(this);
    this.missions = new Missions(this);
    this.hud = new HUD(this);

    this.bindInput();
    window.addEventListener('resize', () => this.onResize());
    document.getElementById('btn-continue').style.display = hasSave() ? 'inline-block' : 'none';

    if (this.shotMode) {
      this.setupShot(this.shotMode);
    } else {
      this.showMenu();
    }
    this.loop();
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // --- screens and state --------------------------------------------------
  showMenu() {
    this.state.mode = 'menu';
    this.hud.showScreen('screen-menu');
    document.getElementById('btn-continue').style.display = hasSave() ? 'inline-block' : 'none';
  }

  setPaused(paused) {
    if (this.state.mode === 'playing' && paused) {
      this.state.mode = 'paused';
      this.hud.showScreen('screen-pause');
    } else if (this.state.mode === 'paused' && !paused) {
      this.state.mode = 'playing';
      this.hud.hideScreens();
    }
  }

  startPlaying() {
    this.state.mode = 'playing';
    this.hud.hideScreens();
    this.audio.ensure();
  }

  newGame() {
    clearSave();
    this.state.cash = 0;
    this.state.wanted = 0;
    this.heat = 0;
    this.state.clockMinutes = 9 * 60 + 15;
    this.missions.completed.clear();
    this.missions.active = null;
    this.peds.clearEnemies();
    this.player.reset(PLACES.marasGarage.x, PLACES.marasGarage.z - 24);
    this.player.ammo = 60;
    this.city.setBeacon(0, 0, false);
    this.startPlaying();
    this.hud.setObjective('Press M to start Mission 1 — Welcome Back');
    this.hud.message('Welcome to Costa Alba, Daz. Mara is waiting at her garage.', 'good');
    this.hud.message('WASD move · mouse drag camera · E enter car / interact · M mission · R radio', '');
    this.saveGame();
  }

  continueGame() {
    const data = loadGame();
    if (!data) { this.newGame(); return; }
    this.state.cash = data.cash || 0;
    this.state.clockMinutes = data.clockMinutes || 9 * 60 + 15;
    this.missions.completed = new Set(data.completed || []);
    this.missions.active = null;
    this.peds.clearEnemies();
    this.player.reset(data.x ?? PLACES.marasGarage.x, data.z ?? PLACES.marasGarage.z);
    this.player.health = data.health ?? CFG.maxHealth;
    this.player.ammo = data.ammo ?? 60;
    this.startPlaying();
    this.hud.setObjective(this.missions.nextMission ? 'Press M to start the next mission' : 'All missions complete — Costa Alba is yours!');
    this.hud.message('Welcome back to Costa Alba.', 'good');
  }

  saveGame() { saveGame(this); }

  retryMission() {
    const next = this.missions.nextMission;
    if (next) {
      this.hud.showScreen(null);
      this.state.mode = 'playing';
      this.missions.startMission(next);
    } else {
      // Nothing left to retry — back to free roam.
      this.startPlaying();
      this.hud.setObjective('All missions complete — Costa Alba is yours!');
    }
  }

  respawn() {
    // Wake up at St. Coral Hospital, lighter in the pocket.
    this.state.cash = Math.max(0, Math.floor(this.state.cash * 0.9));
    this.setWanted(0, 'respawn');
    this.player.reset(PLACES.hospital.x, PLACES.hospital.z - 20);
    this.player.health = CFG.maxHealth;
    this.startPlaying();
    this.hud.setObjective(this.missions.nextMission ? 'Press M to retry the mission' : 'All missions complete — Costa Alba is yours!');
    this.hud.message('You woke up at St. Coral Hospital. The city moves on.', 'warn');
    this.saveGame();
  }

  onPlayerDeath(source) {
    if (this.missions.active) this.missions.failMission('Daz went down.');
    this.deathTimer = 1.4;
  }

  onGameComplete() {
    this.state.mode = 'win';
    this.hud.showScreen('screen-win');
    this.audio.missionSound();
  }

  // --- wanted system -------------------------------------------------------
  starsForHeat(heat) {
    if (heat <= 0) return 0;
    return Math.min(CFG.maxWanted, Math.floor(heat / 20) + 1);
  }

  setWanted(stars, reason) {
    this.heat = stars <= 0 ? 0 : (stars - 1) * 20 + 1;
    this.state.wanted = stars;
    this.state.lastCrimeAt = this.time;
  }

  addWanted(stars, reason) {
    this.heat = Math.min(100, this.heat + stars * 20);
    this.state.wanted = this.starsForHeat(this.heat);
    this.state.lastCrimeAt = this.time;
    if (this.state.wanted >= 3) this.audio.setSiren(true);
  }

  updateWanted(dt) {
    const p = this.player;
    // Heat cools when the player stays clean and out of sight.
    const nearestPolice = this.traffic.police.reduce((m, c) => Math.min(m, Math.hypot(c.x - p.x, c.z - p.z)), 999);
    const sinceCrime = this.time - this.state.lastCrimeAt;
    if (this.heat > 0 && sinceCrime > 6) {
      const rate = nearestPolice > 40 ? 2.4 : nearestPolice > 18 ? 0.9 : 0.25;
      this.heat = Math.max(0, this.heat - rate * dt);
      const stars = this.starsForHeat(this.heat);
      if (stars !== this.state.wanted) {
        this.state.wanted = stars;
        if (stars === 0) {
          this.hud.message('You lost the cops. Costa Alba forgets fast.', 'good');
          this.audio.setSiren(false);
        }
      }
    }
    if (this.state.wanted === 0) this.audio.setSiren(false);
  }

  // --- input ---------------------------------------------------------------
  bindInput() {
    const keyMap = {
      KeyW: 'forward', ArrowUp: 'forward',
      KeyS: 'back', ArrowDown: 'back',
      KeyA: 'left', ArrowLeft: 'left',
      KeyD: 'right', ArrowRight: 'right',
      ShiftLeft: 'run', ShiftRight: 'run',
    };
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.state.mode === 'playing') this.setPaused(true);
        else if (this.state.mode === 'paused') this.setPaused(false);
        return;
      }
      if (this.state.mode !== 'playing') return;
      const mapped = keyMap[e.code];
      if (mapped) { this.input[mapped] = true; e.preventDefault(); }
      if (e.code === 'KeyE') this.onInteract();
      if (e.code === 'KeyM') this.onMissionKey();
      if (e.code === 'KeyR') {
        const name = this.audio.nextStation();
        this.hud.message('Radio: ' + name, '');
      }
      if (e.code === 'KeyP') {
        this.audio.radioOn = !this.audio.radioOn;
        this.hud.message(this.audio.radioOn ? 'Radio on' : 'Radio off', '');
      }
    });
    window.addEventListener('keyup', (e) => {
      const mapped = keyMap[e.code];
      if (mapped) this.input[mapped] = false;
    });
    const canvas = this.renderer.domElement;
    canvas.addEventListener('mousedown', (e) => {
      this.audio.ensure();
      if (this.state.mode !== 'playing') return;
      this.dragging = true;
      this.lastMouse = { x: e.clientX, y: e.clientY };
      if (e.button === 0 && !this.player.inCar) this.player.shoot();
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging || this.state.mode !== 'playing') return;
      const dx = e.clientX - this.lastMouse.x;
      const dy = e.clientY - this.lastMouse.y;
      this.lastMouse = { x: e.clientX, y: e.clientY };
      this.player.camYaw -= dx * 0.005;
      this.player.camPitch = Math.max(0.05, Math.min(1.1, this.player.camPitch + dy * 0.003));
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // Clicking the HUD buttons must not shoot.
    document.getElementById('hud').addEventListener('mousedown', (e) => e.stopPropagation());
  }

  onInteract() {
    const p = this.player;
    if (this.missions.tryCollect()) return;
    if (p.inCar) { p.exitCar(); return; }
    const car = this.traffic.nearestCar(p.x, p.z, 5);
    if (car) { p.enterCar(car); return; }
    this.hud.message('Nothing to interact with here.', '');
  }

  onMissionKey() {
    if (this.missions.active) {
      this.hud.message('Mission in progress: ' + this.missions.active.mission.title, '');
      return;
    }
    const next = this.missions.nextMission;
    if (next) this.missions.startMission(next);
    else this.hud.message('All missions complete — Costa Alba is yours!', 'good');
  }

  // --- camera ---------------------------------------------------------------
  updateCamera(dt) {
    const p = this.player;
    const cam = this.camera;
    // Staged screenshots use a fixed, framed camera.
    if (this.shotCam) {
      cam.position.copy(this.shotCam.pos);
      cam.lookAt(this.shotCam.look);
      return;
    }
    let target;
    let yaw;
    let dist;
    if (p.inCar && p.car) {
      yaw = p.car.heading + Math.PI;
      dist = 13;
      target = new THREE.Vector3(p.car.x, 2.2, p.car.z);
    } else {
      yaw = p.camYaw;
      dist = p.camDist;
      target = new THREE.Vector3(p.x, 2.0, p.z);
    }
    const pitch = p.inCar ? 0.28 : p.camPitch;
    const desired = new THREE.Vector3(
      target.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      target.y + Math.sin(pitch) * dist,
      target.z + Math.cos(yaw) * Math.cos(pitch) * dist
    );
    // Keep the camera out of buildings: clamp above ground and pull in.
    desired.y = Math.max(desired.y, 1.2);
    cam.position.lerp(desired, 1 - Math.pow(0.001, dt));
    cam.lookAt(target.x, target.y, target.z);
  }

  // --- screenshot staging ----------------------------------------------------
  // Deterministic scenes for the 4 screenshots, via ?shot=cover|drive|foot|mission.
  setupShot(mode) {
    this.state.mode = 'playing';
    this.audio.ensure();
    this.hud.hideScreens();
    const p = this.player;
    if (mode === 'cover') {
      // Chase down the avenue: Daz in a red Veloce, 3 stars, police ahead.
      const car = this.traffic.spawnParkedCar();
      car.x = 0; car.z = -40; car.heading = 0;
      car.mesh.children[0].material = car.mesh.children[0].material.clone();
      car.mesh.children[0].material.color.setHex(0xd83a2e);
      car.name = 'Veloce GT';
      car.free = true;
      car.updateMesh();
      p.reset(0, -40);
      p.enterCar(car);
      car.speed = 30;
      this.setWanted(3, 'shot');
      // Stage the pursuit: two interceptors coming down the avenue at Daz,
      // one more closing in from behind, so the chase reads in one frame.
      const cop1 = this.traffic.spawnPoliceCar(0, -40);
      cop1.x = -5; cop1.z = 8; cop1.heading = Math.PI; cop1.speed = 26; cop1.updateMesh();
      const cop2 = this.traffic.spawnPoliceCar(0, -40);
      cop2.x = 6; cop2.z = 30; cop2.heading = Math.PI; cop2.speed = 26; cop2.updateMesh();
      const cop3 = this.traffic.spawnPoliceCar(0, -40);
      cop3.x = 4; cop3.z = -78; cop3.heading = 0; cop3.speed = 30; cop3.updateMesh();
      this.missions.startMission(this.missions.nextMission);
      this.hud.setObjective('Escape the Alba PD — lose 3 stars');
      p.camYaw = Math.PI;
    } else if (mode === 'drive') {
      // Sunset cruise along the beach road (the z=320 road, heading east).
      const car = this.traffic.spawnParkedCar();
      car.x = 120; car.z = 320; car.heading = Math.PI / 2;
      car.updateMesh();
      car.free = true;
      p.reset(120, 320);
      p.enterCar(car);
      car.speed = 32;
      this.city.sun.position.set(-220, 90, 260);
      this.city.sun.color.setHex(0xffc890);
      this.scene.background = new THREE.Color(0xf0b070);
      this.scene.fog = new THREE.Fog(0xe8a070, 220, 900);
      this.hud.setObjective('Cruise Palma Verde Beach — explore Costa Alba');
      p.camYaw = Math.PI;
    } else if (mode === 'foot') {
      // Shootout at the docks: Daz on foot in the open yard, rivals ahead.
      // Fixed elevated camera so the containers never block the frame.
      p.reset(250, 228);
      p.camYaw = -Math.PI / 2;
      p.heading = Math.PI / 2;
      for (let i = 0; i < 4; i++) {
        this.peds.spawnEnemy(276 + i * 6, 222 + (i % 2) * 10);
      }
      this.setWanted(2, 'shot');
      this.shotCam = {
        pos: new THREE.Vector3(232, 13, 206),
        look: new THREE.Vector3(282, 1, 228),
      };
      this.hud.setObjective('Turbulence — eliminate the rivals at Coral Docks (2/6)');
      this.hud.message('Rival crew at the docks — take them out!', 'crime');
    } else if (mode === 'mission') {
      // The Vault: Daz outside Alba National Bank, guards and beacon.
      // Fixed elevated camera looking over the bank's forecourt.
      p.reset(40, 62);
      p.camYaw = Math.PI;
      p.heading = Math.PI;
      for (let i = 0; i < 3; i++) {
        this.peds.spawnEnemy(30 + i * 10, 50);
      }
      this.city.setBeacon(PLACES.bank.x, PLACES.bank.z, true);
      this.setWanted(1, 'shot');
      this.shotCam = {
        pos: new THREE.Vector3(14, 15, 92),
        look: new THREE.Vector3(40, 2, 46),
      };
      this.hud.setObjective('The Vault — take out the 4 bank guards (0/4)');
      this.hud.message('Mission 8: The Vault — Alba National Bank', 'good');
    }
    this.hud.update();
    setTimeout(() => { this.shotReady = true; window.__shotReady = true; }, 1800);
  }

  // --- main loop ---------------------------------------------------------------
  loop() {
    const clock = new THREE.Clock();
    const tick = () => {
      requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      this.time += dt;
      if (this.state.mode === 'playing') {
        this.state.clockMinutes += dt * 2;
        this.player.update(dt, this.input);
        this.traffic.update(dt);
        this.peds.update(dt);
        this.missions.update(dt);
        this.city.update(dt, this.time);
        this.effects.update(dt);
        this.updateWanted(dt);
        if (this.player.dead) {
          this.deathTimer -= dt;
          if (this.deathTimer <= 0 && this.state.mode === 'playing') {
            this.state.mode = 'dead';
            this.hud.showScreen('screen-dead');
          }
        }
        this.updateCamera(dt);
        this.hud.update();
      } else if (this.state.mode === 'menu') {
        // Slow orbit around Plaza del Sol behind the menu.
        const t = this.time * 0.05;
        this.camera.position.set(Math.sin(t) * 90, 42, Math.cos(t) * 90);
        this.camera.lookAt(0, 8, 0);
        this.city.update(dt, this.time);
        this.traffic.update(dt);
        this.peds.update(dt);
      } else {
        this.city.update(dt, this.time);
        this.effects.update(dt);
      }
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  window.__game = game;
  document.title = TITLE + ' — Open-World Crime';
  game.boot();
});
