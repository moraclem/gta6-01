// Costa Alba — the story: 9 missions for Dario "Daz" Ferrer.
// One clear job: mission data, step engine, rewards, fail and finish.

import { PLACES, dist2 } from './config.js';

// Step types:
//  goto    — reach the marker (on foot or in a car)
//  drive   — reach the marker while driving
//  enter   — get into the named car
//  collect — stand at the marker and press E
//  kill    — eliminate N enemies (spawned when the step starts)
//  deliver — reach the marker (usually carrying something)
//  escape  — drop the wanted level to zero (timer shown)
//  survive — stay alive for N seconds
export const MISSIONS = [
  {
    id: 1, title: 'Welcome Back', giver: 'Mara Solis',
    brief: 'Daz is back in Costa Alba and broke. Mara needs a driver — get to her garage and hear the job.',
    reward: 150,
    steps: [
      { type: 'goto', at: PLACES.marasGarage, text: 'Drive or walk to Mara\'s Garage' },
    ],
  },
  {
    id: 2, title: 'Hot Wheels', giver: 'Mara Solis',
    brief: 'A Veloce GT is parked by the plaza. Steal it and bring it to the garage. Try not to get seen.',
    reward: 400,
    steps: [
      { type: 'enter', car: 'veloce', at: PLACES.plaza, text: 'Steal the Veloce GT at Plaza del Sol' },
      { type: 'drive', at: PLACES.marasGarage, text: 'Deliver the Veloce to Mara\'s Garage' },
    ],
  },
  {
    id: 3, title: 'Debt Collector', giver: 'Mara Solis',
    brief: 'Three shops on Mercado Row owe Mara money. Visit each one and collect. Be polite. Mostly.',
    reward: 600,
    steps: [
      { type: 'collect', at: { x: -200, z: 120, name: 'Mercado Stall 1' }, text: 'Collect from Mercado Stall 1 (press E)' },
      { type: 'collect', at: { x: -160, z: 160, name: 'Mercado Stall 2' }, text: 'Collect from Mercado Stall 2 (press E)' },
      { type: 'collect', at: { x: -240, z: 80, name: 'Mercado Stall 3' }, text: 'Collect from Mercado Stall 3 (press E)' },
    ],
  },
  {
    id: 4, title: 'The Drop', giver: 'Mara Solis',
    brief: 'A package for the Hotel Miramar, and the clock is ticking. Get it there in 90 seconds — the cops are already twitchy.',
    reward: 800,
    steps: [
      { type: 'collect', at: PLACES.marasGarage, text: 'Pick up the package at the garage (press E)' },
      { type: 'deliver', at: PLACES.hotel, text: 'Deliver the package to Hotel Miramar', time: 90, wanted: 2 },
    ],
  },
  {
    id: 5, title: 'Turbulence', giver: 'Vince Kroll',
    brief: 'Kroll\'s rivals are moving product through Coral Docks. Send a message: take out six of them.',
    reward: 1200,
    steps: [
      { type: 'goto', at: PLACES.docks, text: 'Get to Coral Docks' },
      { type: 'kill', at: PLACES.docks, count: 6, text: 'Eliminate 6 rivals at the docks' },
    ],
  },
  {
    id: 6, title: 'Grand Theft Alba', giver: 'Mara Solis',
    brief: 'An armored van full of casino cash is parked at the airfield. Take it — then lose the cops.',
    reward: 1500,
    steps: [
      { type: 'enter', car: 'van', at: PLACES.airport, text: 'Steal the armored van at Alba Airfield' },
      { type: 'escape', text: 'Lose the police (drop to 0 stars)' },
      { type: 'drive', at: PLACES.marasGarage, text: 'Bring the van to Mara\'s Garage' },
    ],
  },
  {
    id: 7, title: 'Beach Party Bust', giver: 'Vince Kroll',
    brief: 'A dealer who skimmed Kroll is fleeing down Palma Verde Beach in a Comet. Ram his car until it stops.',
    reward: 1800,
    steps: [
      { type: 'goto', at: PLACES.beach, text: 'Get to Palma Verde Beach' },
      { type: 'chase', at: PLACES.beach, text: 'Ram the dealer\'s Comet until it stops' },
    ],
  },
  {
    id: 8, title: 'The Vault', giver: 'Mara Solis',
    brief: 'Alba National Bank. In, grab the cash, out — with every cop in the city behind you.',
    reward: 3000,
    steps: [
      { type: 'goto', at: PLACES.bank, text: 'Get to Alba National Bank' },
      { type: 'kill', at: PLACES.bank, count: 4, text: 'Take out the 4 bank guards' },
      { type: 'collect', at: PLACES.bank, text: 'Grab the cash (press E)' },
      { type: 'escape', text: 'Escape with 4 stars — drop to 0 stars', wanted: 4 },
    ],
  },
  {
    id: 9, title: 'King of Costa Alba', giver: 'Mara Solis',
    brief: 'It ends tonight. Kroll is at his mansion with his crew. Take the house — then Costa Alba is yours.',
    reward: 5000,
    steps: [
      { type: 'goto', at: PLACES.mansion, text: 'Get to Kroll\'s Mansion' },
      { type: 'kill', at: PLACES.mansion, count: 8, text: 'Take out Kroll\'s 8 guards' },
      { type: 'kill', at: PLACES.mansion, count: 1, boss: true, text: 'Face Vince Kroll' },
      { type: 'goto', at: PLACES.plaza, text: 'Return to Plaza del Sol a free man' },
    ],
  },
];

export class Missions {
  constructor(G) {
    this.G = G;
    this.active = null; // {mission, stepIndex, kills, timer, targetCar, chaseCar}
    this.completed = new Set();
    this.started = false;
  }

  get nextMission() {
    return MISSIONS.find((m) => !this.completed.has(m.id)) || null;
  }

  startMission(mission) {
    this.active = { mission, stepIndex: 0, kills: 0, timer: 0, targetCar: null, chaseCar: null };
    this.started = true;
    this.G.audio.missionSound();
    this.G.hud.showMissionIntro(mission);
    this.beginStep();
    this.G.saveGame();
  }

  beginStep() {
    const step = this.currentStep();
    if (!step) return;
    const G = this.G;
    G.hud.setObjective(step.text);
    if (step.at) G.city.setBeacon(step.at.x, step.at.z, true);
    else G.city.setBeacon(G.player.x, G.player.z, false);
    if (step.type === 'kill') {
      this.active.kills = 0;
      const n = step.count;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        G.peds.spawnEnemy(step.at.x + Math.cos(a) * 14, step.at.z + Math.sin(a) * 14, {
          health: step.boss ? 160 : 60,
          name: step.boss ? 'Vince Kroll' : 'Rival',
          shirt: step.boss ? 0x202020 : 0x8a2020,
        });
      }
    }
    if (step.type === 'enter' && step.car === 'veloce') {
      // Park a red Veloce GT at the plaza for the player to steal.
      const car = G.traffic.spawnParkedCar();
      car.mesh.position.set(PLACES.plaza.x + 14, 0, PLACES.plaza.z);
      car.x = PLACES.plaza.x + 14;
      car.z = PLACES.plaza.z;
      car.heading = Math.PI / 2;
      car.updateMesh();
      car.mesh.children[0].material = car.mesh.children[0].material.clone();
      car.mesh.children[0].material.color.setHex(0xd83a2e);
      car.name = 'Veloce GT';
      this.active.targetCar = car;
    }
    if (step.type === 'enter' && step.car === 'van') {
      const car = G.traffic.spawnParkedCar();
      car.x = PLACES.airport.x + 10;
      car.z = PLACES.airport.z;
      car.heading = 0;
      car.updateMesh();
      car.name = 'Armored Van';
      this.active.targetCar = car;
    }
    if (step.type === 'chase') {
      // Spawn the fleeing dealer car and make it drive away along the beach.
      const car = G.traffic.spawnTrafficCar();
      car.x = PLACES.beach.x;
      car.z = PLACES.beach.z;
      car.heading = Math.PI / 2;
      car.speed = 18;
      car.targetSpeed = 22;
      car.name = "Dealer's Comet";
      car.chaseTarget = true;
      car.chaseHealth = 100;
      this.active.chaseCar = car;
    }
    if (step.time) this.active.timer = step.time;
    if (step.wanted) G.setWanted(step.wanted, 'mission heat');
  }

  currentStep() {
    if (!this.active) return null;
    return this.active.mission.steps[this.active.stepIndex] || null;
  }

  advanceStep() {
    this.active.stepIndex++;
    this.active.kills = 0;
    if (this.active.stepIndex >= this.active.mission.steps.length) {
      this.completeMission();
    } else {
      this.G.audio.blip(880, 0.1);
      this.beginStep();
    }
  }

  completeMission() {
    const m = this.active.mission;
    this.completed.add(m.id);
    this.active = null;
    this.G.city.setBeacon(0, 0, false);
    this.G.state.cash += m.reward;
    this.G.audio.cashSound();
    this.G.hud.showMissionComplete(m);
    this.G.hud.setObjective(this.nextMission ? 'Press M to start the next mission' : 'All missions complete — Costa Alba is yours!');
    this.G.saveGame();
    if (!this.nextMission) this.G.onGameComplete();
  }

  failMission(reason) {
    if (!this.active) return;
    const m = this.active.mission;
    this.G.peds.clearEnemies();
    this.active = null;
    this.G.city.setBeacon(0, 0, false);
    this.G.audio.failSound();
    this.G.hud.showMissionFailed(m, reason);
    this.G.hud.setObjective('Press M to retry the mission');
  }

  onEnemyKilled(enemy) {
    if (!this.active) return;
    const step = this.currentStep();
    if (step && step.type === 'kill') {
      this.active.kills++;
      this.G.hud.setObjective(`${step.text} (${this.active.kills}/${step.count})`);
      if (this.active.kills >= step.count) this.advanceStep();
    }
  }

  // E key at a collect marker.
  tryCollect() {
    if (!this.active) return false;
    const step = this.currentStep();
    if (!step || step.type !== 'collect' || !step.at) return false;
    const p = this.G.player;
    if (dist2(p.x, p.z, step.at.x, step.at.z) < 6) {
      this.G.audio.cashSound();
      this.G.state.cash += 50;
      this.advanceStep();
      return true;
    }
    return false;
  }

  update(dt) {
    if (!this.active) return;
    const step = this.currentStep();
    if (!step) return;
    const p = this.G.player;
    if (step.time) {
      this.active.timer -= dt;
      this.G.hud.setTimer(Math.max(0, this.active.timer));
      if (this.active.timer <= 0) {
        this.failMission('Out of time.');
        return;
      }
    }
    if (step.type === 'goto' || step.type === 'drive' || step.type === 'deliver') {
      const radius = step.type === 'drive' ? 9 : 7;
      if (step.at && dist2(p.x, p.z, step.at.x, step.at.z) < radius) {
        if (step.type === 'drive' && !p.inCar) return; // must arrive driving
        this.advanceStep();
      }
    }
    if (step.type === 'enter') {
      if (p.inCar && p.car === this.active.targetCar) {
        this.active.targetCar.free = true; // mission car: no extra wanted for it
        this.advanceStep();
      }
    }
    if (step.type === 'escape') {
      if (this.G.state.wanted === 0) this.advanceStep();
    }
    if (step.type === 'chase' && this.active.chaseCar) {
      const c = this.active.chaseCar;
      // The dealer flees east along the beach road, swerving.
      c.targetSpeed = 24;
      const wantHeading = Math.PI / 2 + Math.sin(this.G.time * 0.8) * 0.3;
      let dh = wantHeading - c.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      c.drive(dt, 1, Math.max(-1, Math.min(1, dh * 2)), 26);
      const fixed = this.G.city.collideCircle(c.x, c.z, 2.2);
      c.x = fixed.x; c.z = fixed.z;
      c.updateMesh();
      // Player ramming damages it.
      if (p.inCar && p.car) {
        const d = dist2(p.car.x, p.car.z, c.x, c.z);
        if (d < 4 && Math.abs(p.car.speed) > 6) {
          c.chaseHealth -= 26;
          p.car.speed *= 0.5;
          this.G.audio.crash();
          this.G.effects.sparks(c.x, 0.8, c.z);
          this.G.hud.setObjective(`Ram the dealer's Comet (${Math.max(0, Math.round(c.chaseHealth))}% left)`);
          if (c.chaseHealth <= 0) {
            c.speed = 0;
            this.advanceStep();
          }
        }
      }
      if (c.x > 400) { c.x = -380; c.z = PLACES.beach.z; }
    }
  }
}
