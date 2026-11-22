// Costa Alba — story: nine missions for Dario "Daz" Ferrer, fixer Mara Solis and
// loan shark Vince Kroll. Each mission is a short list of steps (go somewhere,
// steal a car, wipe out a crew, beat the clock, ram a target) run by one engine,
// so adding a mission is data, not new code.
import * as THREE from 'three';
import { clamp } from './util.js';

export const MISSIONS = [
  { id: 1, title: 'Welcome Back', reward: 500,
    brief: 'Mara: "Daz! You\'re back in Costa Alba. Come to the garage, then swing by Plaza del Sol so the city sees you."',
    steps: [
      { kind: 'goto', x: -90, z: 114, r: 8, text: 'Drive to Mara\'s Garage' },
      { kind: 'driveTo', x: 30, z: 150, r: 12, text: 'Cruise to Plaza del Sol' },
    ] },
  { id: 2, title: 'Hot Wheels', reward: 800,
    brief: 'Mara: "A Comet GT is parked outside Hotel Miramar. The owner owes Vince money. Take it. Bring it here."',
    steps: [
      { kind: 'enterCar', tag: 'comet', x: 120, z: 296, r: 30, text: 'Steal the Comet GT at Hotel Miramar' },
      { kind: 'driveTo', x: -90, z: 114, r: 10, text: 'Deliver the Comet to the garage' },
    ] },
  { id: 3, title: 'Debt Collector', reward: 1200,
    brief: 'Vince Kroll: "Three of my boys at Mercado Alba forgot who they owe. Remind them. Loudly."',
    steps: [
      { kind: 'goto', x: -30, z: 232, r: 10, text: 'Reach Mercado Alba' },
      { kind: 'eliminate', text: 'Deal with Kroll\'s three debtors',
        spawn: [[-18, 232, {}], [-56, 214, {}], [-4, 244, {}]] },
      { kind: 'goto', x: -90, z: 114, r: 8, text: 'Report back to Mara' },
    ] },
  { id: 4, title: 'The Drop', reward: 1500,
    brief: 'Mara: "A package is waiting at Coral Docks and the buyer leaves in 90 seconds. No sightseeing, Daz."',
    steps: [
      { kind: 'timed', x: 372, z: 150, r: 14, seconds: 90, text: 'Reach Coral Docks before the buyer leaves' },
    ] },
  { id: 5, title: 'Turbulence', reward: 2000,
    brief: 'Mara: "The dock crew took our shipment. Six of them, all armed. Take the docks back."',
    steps: [
      { kind: 'goto', x: 372, z: 150, r: 16, text: 'Get to Coral Docks' },
      { kind: 'eliminate', text: 'Clear the dock crew (6)',
        spawn: [[345, 135, {}], [352, 155, {}], [368, 140, {}], [345, 170, {}], [378, 165, {}], [360, 120, {}]] },
    ] },
  { id: 6, title: 'Grand Theft Alba', reward: 3000,
    brief: 'Vince: "An armored van leaves Alba National Bank at noon. Take it. The whole city will be looking for you."',
    steps: [
      { kind: 'enterCar', tag: 'van', x: 90, z: -4, r: 30, text: 'Steal the armored van at the bank' },
      { kind: 'driveTo', x: -90, z: 114, r: 10, text: 'Lose the heat — reach the garage', wanted: 3 },
    ] },
  { id: 7, title: 'Beach Party Bust', reward: 2500,
    brief: 'Mara: "Kroll\'s courier is showing off on the beach road. Ram his ride until it stops. Don\'t be gentle."',
    steps: [
      { kind: 'goto', x: 180, z: 300, r: 12, text: 'Get to the beach road' },
      { kind: 'ram', text: 'Ram the courier\'s car until it\'s wrecked' },
    ] },
  { id: 8, title: 'The Vault', reward: 5000,
    brief: 'Vince: "The bank vault. Four guards, one alarm, seventy-five seconds to vanish. This is the big one, Daz."',
    steps: [
      { kind: 'goto', x: 90, z: -4, r: 10, text: 'Reach Alba National Bank' },
      { kind: 'eliminate', text: 'Silence the four vault guards',
        spawn: [[66, -18, {}], [114, -18, {}], [66, -42, {}], [114, -42, {}]] },
      { kind: 'timed', x: -90, z: 114, r: 10, seconds: 75, text: 'Escape to the garage before the lockdown' },
    ] },
  { id: 9, title: 'King of Costa Alba', reward: 10000,
    brief: 'Mara: "Kroll is in his mansion with his whole crew. End this, Daz — and Costa Alba is yours."',
    steps: [
      { kind: 'goto', x: 270, z: -182, r: 12, text: 'Storm the gates of Kroll\'s Mansion' },
      { kind: 'eliminate', text: 'Take down Kroll and his crew (8)',
        spawn: [[258, -188, {}], [282, -188, {}], [250, -210, {}], [290, -210, {}],
                [258, -232, {}], [282, -232, {}], [262, -190, {}], [270, -232, { boss: true, name: 'Vince Kroll' }]] },
    ] },
];

export class Story {
  constructor(scene, bus, fleet, crowd, hooks) {
    this.scene = scene; this.bus = bus; this.fleet = fleet; this.crowd = crowd;
    this.hooks = hooks;
    this.index = -1;          // -1: no mission active
    this.stepIdx = 0;
    this.timer = 0;
    this.specialCar = null;
    this.targetCar = null;
    this.targetDir = 1;
    this.beacon = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 34, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 17;
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.4, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.25;
    this.beacon.add(beam, ring);
    this.beacon.visible = false;
    scene.add(this.beacon);
    this.beaconRing = ring;
  }

  get current() { return this.index >= 0 ? MISSIONS[this.index] : null; }
  get step() { return this.current ? this.current.steps[this.stepIdx] : null; }

  objectiveText() {
    if (!this.current) return 'Free roam — press M for the next job, or explore Costa Alba.';
    return `${this.current.title}: ${this.step.text}`;
  }

  beaconPos() {
    const s = this.step;
    if (!s) return null;
    if (s.kind === 'eliminate') {
      const alive = this.crowd.livingGoons();
      if (alive.length) return { x: alive[0].x, z: alive[0].z };
      return null;
    }
    if (s.kind === 'ram' && this.targetCar) {
      return { x: this.targetCar.group.position.x, z: this.targetCar.group.position.z };
    }
    if (s.kind === 'enterCar' && this.specialCar) {
      return { x: this.specialCar.group.position.x, z: this.specialCar.group.position.z };
    }
    return { x: s.x, z: s.z };
  }

  startMission(i) {
    this.index = i;
    this.stepIdx = 0;
    this.timer = 0;
    this.crowd.clearGoons();
    const m = MISSIONS[i];
    this.bus.emit('message', `Mission ${m.id}/9 — ${m.title}`);
    this.bus.emit('message', m.brief);
    this.bus.emit('sound', 'mission');
    this.enterStep();
  }

  enterStep() {
    const s = this.step;
    if (!s) { this.completeMission(); return; }
    if (s.kind === 'timed') this.timer = s.seconds;
    if (s.kind === 'eliminate') {
      for (const [x, z, opts] of s.spawn) this.crowd.spawnGoon(x, z, opts);
    }
    if (s.kind === 'enterCar') {
      if (s.tag === 'comet') {
        this.specialCar = this.fleet.makeCar(120, 296, Math.PI / 2, 0xc23b2e, 'parked', 'Comet GT');
        this.specialCar.special = 'comet';
      } else if (s.tag === 'van') {
        this.specialCar = this.fleet.makeCar(90, -4, 0, 0x8a8f96, 'parked', 'Armored Van');
        this.specialCar.special = 'van';
      }
    }
    if (s.kind === 'ram') {
      this.targetCar = this.fleet.makeCar(60, 300, Math.PI / 2, 0xb83a6e, 'target', "Courier's Coupe");
      this.targetDir = 1;
    }
    if (s.wanted) this.hooks.setWanted(s.wanted);
    this.bus.emit('message', s.text);
  }

  nextStep() {
    this.stepIdx++;
    if (this.stepIdx >= this.current.steps.length) this.completeMission();
    else this.enterStep();
  }

  completeMission() {
    const m = this.current;
    this.bus.emit('message', `Mission complete: ${m.title} — $${m.reward.toLocaleString('en-US')}`);
    this.bus.emit('sound', 'complete');
    this.hooks.addCash(m.reward);
    this.crowd.clearGoons();
    this.beacon.visible = false;
    this.specialCar = null;
    this.targetCar = null;
    if (this.index >= MISSIONS.length - 1) {
      this.index = -1;
      this.hooks.onWin();
      return;
    }
    this.index++;
    this.stepIdx = 0;
    this.timer = 0;
    this.enterStep();
    // startMission-style intro for the chained mission
    const next = this.current;
    this.bus.emit('message', `Mission ${next.id}/9 — ${next.title}`);
    this.bus.emit('message', next.brief);
  }

  failMission(reason) {
    const m = this.current;
    if (!m) return;
    this.bus.emit('message', `Mission failed: ${reason} — try again.`);
    this.bus.emit('sound', 'fail');
    this.crowd.clearGoons();
    if (this.targetCar) { this.fleet.remove(this.targetCar); this.targetCar = null; }
    this.beacon.visible = false;
    this.hooks.setWanted(0);
    this.startMission(this.index);
  }

  update(dt, player) {
    // beacon animation + placement
    const bp = this.beaconPos();
    if (bp && this.current) {
      this.beacon.visible = true;
      this.beacon.position.set(bp.x, 0, bp.z);
      const pulse = 1 + Math.sin(performance.now() / 300) * 0.12;
      this.beaconRing.scale.setScalar(pulse);
    } else {
      this.beacon.visible = false;
    }
    // target car cruises the beach road until wrecked
    if (this.targetCar && !this.targetCar.dead) {
      const t = this.targetCar;
      if (t.group.position.x > 340) this.targetDir = -1;
      if (t.group.position.x < -340) this.targetDir = 1;
      const wantHeading = this.targetDir > 0 ? Math.PI / 2 : -Math.PI / 2;
      const steer = clamp((wantHeading - t.heading + Math.PI * 3) % (Math.PI * 2) - Math.PI, -0.6, 0.6);
      this.fleet.drive(t, dt, 0.8, steer * 0.5);
      t.group.position.z += (300 - t.group.position.z) * dt * 0.5;
    }
    const s = this.step;
    if (!s || !this.current) return;
    if (s.kind === 'goto' || s.kind === 'driveTo') {
      const d = Math.hypot(player.x - s.x, player.z - s.z);
      if (d < s.r) this.nextStep();
    } else if (s.kind === 'timed') {
      this.timer -= dt;
      const d = Math.hypot(player.x - s.x, player.z - s.z);
      if (d < s.r) { this.nextStep(); return; }
      if (this.timer <= 0) this.failMission('Out of time');
    } else if (s.kind === 'enterCar') {
      if (player.inCar && player.car === this.specialCar) {
        this.bus.emit('message', 'Got it. Now move!');
        this.nextStep();
      }
    } else if (s.kind === 'eliminate') {
      if (this.crowd.livingGoons().length === 0) this.nextStep();
    } else if (s.kind === 'ram') {
      if (this.targetCar && this.targetCar.dead) {
        this.bus.emit('message', "The courier's ride is scrap. Nice driving.");
        this.nextStep();
      }
    }
  }
}
