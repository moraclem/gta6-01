// Costa Alba — interface: HUD (health, cash, clock, wanted stars, speed, ammo),
// a circular minimap drawn from live world data, the message feed, and the
// start / pause / death / win screens. All DOM, no framework.
import { clamp } from './util.js';

const LANDMARK_COLORS = {
  bank: '#ffd76a', garage: '#ff7a5c', hospital: '#ffffff', mercado: '#7ed67e',
  hotel: '#8fd0ff', mansion: '#e8b73c', plaza: '#7fb8d9', docks: '#c98a5a', airfield: '#b8b8b8',
};

export class Interface {
  constructor(bus, world) {
    this.bus = bus;
    this.world = world;
    this.callbacks = {};
    this.feedItems = [];
    this.buildDom();
    bus.on('message', (text) => this.feed(text));
  }

  on(name, fn) { this.callbacks[name] = fn; }

  buildDom() {
    const root = document.getElementById('ui');
    root.innerHTML = `
      <div id="hud" class="hidden">
        <div id="hud-top-left">
          <div id="objective"></div>
          <div id="health-wrap"><div id="health-bar"></div><span id="health-num">100</span></div>
          <div id="ammo">PISTOL — 12 / 12</div>
        </div>
        <div id="hud-top-right">
          <div id="stars"></div>
          <div id="cash">$0</div>
          <div id="clock">09:00</div>
          <div id="station">RADIO: OFF</div>
        </div>
        <div id="speedo" class="hidden"><span id="speed-num">0</span><small>km/h</small></div>
        <div id="crosshair" class="hidden">+</div>
        <div id="minimap-wrap"><canvas id="minimap" width="200" height="200"></canvas></div>
        <div id="feed"></div>
        <div id="hint">WASD move • E enter car • F shoot • R reload • M mission • P pause • 1/2/3 radio</div>
      </div>
      <div id="menu" class="overlay">
        <div class="panel">
          <h1>COSTA<br>ALBA</h1>
          <p class="tag">An open-world crime story on the Coral Coast.<br>Dario "Daz" Ferrer is back — and Vince Kroll owns this town.</p>
          <button id="btn-new">NEW GAME</button>
          <button id="btn-continue">CONTINUE</button>
          <div class="controls">
            <b>HOW TO PLAY</b>
            WASD — move / drive &nbsp;·&nbsp; Mouse — look &amp; aim<br>
            E — steal / enter car &nbsp;·&nbsp; F or Click — shoot &nbsp;·&nbsp; R — reload<br>
            M — next mission &nbsp;·&nbsp; P / Esc — pause &nbsp;·&nbsp; 1 / 2 / 3 — radio<br>
            Follow the yellow beacon. Stealing cars and shooting raises your wanted level.
          </div>
        </div>
      </div>
      <div id="pause" class="overlay hidden">
        <div class="panel"><h2>PAUSED</h2>
          <button id="btn-resume">RESUME</button>
          <button id="btn-save">SAVE GAME</button>
          <button id="btn-quit">QUIT TO MENU</button>
        </div>
      </div>
      <div id="dead" class="overlay hidden">
        <div class="panel"><h2 class="red">FLATLINED</h2>
          <p class="tag">Daz wakes up at St. Coral Hospital, lighter by $250.<br>The city keeps moving without you.</p>
          <button id="btn-respawn">WAKE UP AT THE HOSPITAL</button>
        </div>
      </div>
      <div id="win" class="overlay hidden">
        <div class="panel"><h2 class="gold">KING OF COSTA ALBA</h2>
          <p class="tag">Kroll is finished. The docks, the bank, the beach — all yours now, Daz.<br>All 9 missions complete. Free roam the city as its king.</p>
          <button id="btn-freeroam">KEEP PLAYING</button>
        </div>
      </div>`;
    const click = (id, name) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => this.callbacks[name]?.());
    };
    click('btn-new', 'newGame');
    click('btn-continue', 'continueGame');
    click('btn-resume', 'resume');
    click('btn-save', 'save');
    click('btn-quit', 'quitToMenu');
    click('btn-respawn', 'respawn');
    click('btn-freeroam', 'freeRoam');
    this.minimap = document.getElementById('minimap');
    this.mm = this.minimap.getContext('2d');
  }

  show(id) { document.getElementById(id)?.classList.remove('hidden'); }
  hide(id) { document.getElementById(id)?.classList.add('hidden'); }

  showMenu(hasSave) {
    this.hide('hud'); this.hide('pause'); this.hide('dead'); this.hide('win');
    this.show('menu');
    document.getElementById('btn-continue').style.display = hasSave ? '' : 'none';
  }
  hideMenu() { this.hide('menu'); this.show('hud'); }
  showPause() { this.show('pause'); }
  hidePause() { this.hide('pause'); }
  showDead() { this.show('dead'); }
  hideDead() { this.hide('dead'); }
  showWin() { this.show('win'); }
  hideWin() { this.hide('win'); }

  feed(text) {
    this.feedItems.push({ text, t: Date.now() });
    if (this.feedItems.length > 4) this.feedItems.shift();
    const el = document.getElementById('feed');
    el.innerHTML = this.feedItems.map((m) => `<div>${m.text}</div>`).join('');
  }

  update(state) {
    // state: {health, cash, wanted, speedKmh, inCar, ammo, mag, clockMin, objective,
    //  timer, x, z, heading, police: [{x,z}], beacon: {x,z}|null, goons: [{x,z}],
    //  station, armed}
    document.getElementById('health-bar').style.width = `${clamp(state.health, 0, 100)}%`;
    document.getElementById('health-num').textContent = Math.ceil(state.health);
    document.getElementById('cash').textContent = `$${Math.floor(state.cash).toLocaleString('en-US')}`;
    const hh = Math.floor(state.clockMin / 60) % 24, mm = Math.floor(state.clockMin % 60);
    document.getElementById('clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    document.getElementById('stars').innerHTML = Array.from({ length: 5 },
      (_, i) => `<span class="${i < state.wanted ? 'on' : ''}">★</span>`).join('');
    document.getElementById('ammo').textContent = `PISTOL — ${state.ammo} / ${state.mag}`;
    document.getElementById('station').textContent = `RADIO: ${state.station}`;
    const obj = state.timer > 0
      ? `${state.objective}  —  ${Math.ceil(state.timer)}s`
      : state.objective;
    document.getElementById('objective').textContent = obj;
    const speedo = document.getElementById('speedo');
    if (state.inCar) {
      speedo.classList.remove('hidden');
      document.getElementById('speed-num').textContent = Math.round(state.speedKmh);
    } else speedo.classList.add('hidden');
    document.getElementById('crosshair').classList.toggle('hidden', !state.armed);
    this.drawMinimap(state);
  }

  drawMinimap(state) {
    const g = this.mm, S = 200, C = S / 2;
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(C, C, C - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = 'rgba(20, 28, 34, 0.88)'; g.fillRect(0, 0, S, S);
    const scale = S / 760; // world -380..380 maps onto the disc
    const toMap = (x, z) => [C + x * scale, C + z * scale];
    // roads
    g.strokeStyle = '#6a7076'; g.lineWidth = 2.5;
    for (const r of this.world.roadLines) {
      const [x1, y1] = toMap(-380, r), [x2, y2] = toMap(380, r);
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      const [x3, y3] = toMap(r, -380), [x4, y4] = toMap(r, 380);
      g.beginPath(); g.moveTo(x3, y3); g.lineTo(x4, y4); g.stroke();
    }
    // beach + sea
    g.fillStyle = '#e8cf9e'; g.fillRect(0, C + 330 * scale, S, S);
    g.fillStyle = '#1e7fa8'; g.fillRect(0, C + 420 * scale, S, S);
    // landmarks
    for (const [key, lm] of Object.entries(this.world.landmarks)) {
      const [x, y] = toMap(lm.x, lm.z);
      g.fillStyle = LANDMARK_COLORS[key] || '#ffffff';
      g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
    }
    // mission beacon
    if (state.beacon) {
      const [x, y] = toMap(state.beacon.x, state.beacon.z);
      const pulse = 6 + Math.sin(Date.now() / 250) * 2;
      g.fillStyle = '#ffd76a';
      g.beginPath(); g.arc(x, y, pulse, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1a1a1a'; g.font = 'bold 10px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('!', x, y);
    }
    // goons
    g.fillStyle = '#ff5a3c';
    for (const go of state.goons || []) {
      const [x, y] = toMap(go.x, go.z);
      g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
    }
    // police
    g.fillStyle = '#3c8bff';
    for (const p of state.police || []) {
      const [x, y] = toMap(p.x, p.z);
      g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill();
    }
    // player arrow (rotates with heading)
    const [px, py] = toMap(state.x, state.z);
    g.save();
    g.translate(px, py); g.rotate(state.heading);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(-6, 6); g.closePath(); g.fill();
    g.strokeStyle = '#111'; g.lineWidth = 1; g.stroke();
    g.restore();
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3;
    g.beginPath(); g.arc(C, C, C - 2, 0, Math.PI * 2); g.stroke();
  }
}
