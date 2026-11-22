// Costa Alba — HUD, minimap, menus and messages.
// One clear job: everything the player reads on screen.

import { CFG, PLACES, fmtCash, fmtClock } from './config.js';

export class HUD {
  constructor(G) {
    this.G = G;
    this.el = (id) => document.getElementById(id);
    this.msgTimer = null;
    this.minimap = this.el('minimap').getContext('2d');
    this.damageEl = this.el('damage-flash');
    this.bindMenuButtons();
  }

  bindMenuButtons() {
    const G = this.G;
    const on = (id, fn) => {
      const b = this.el(id);
      if (b) b.addEventListener('click', () => { G.audio.ensure(); fn(); });
    };
    on('btn-new', () => G.newGame());
    on('btn-continue', () => G.continueGame());
    on('btn-how', () => { this.el('howto').style.display = 'block'; });
    on('btn-how-close', () => { this.el('howto').style.display = 'none'; });
    on('btn-resume', () => G.setPaused(false));
    on('btn-save', () => { G.saveGame(); this.message('Game saved.', 'good'); });
    on('btn-quit', () => G.showMenu());
    on('btn-retry', () => G.retryMission());
    on('btn-dead-retry', () => G.respawn());
    on('btn-dead-menu', () => G.showMenu());
    on('btn-win-menu', () => G.showMenu());
  }

  setObjective(text) {
    this.el('objective').textContent = text;
  }

  setTimer(seconds) {
    const t = this.el('timer');
    if (seconds > 0) {
      t.style.display = 'block';
      t.textContent = '⏱ ' + Math.ceil(seconds) + 's';
    } else {
      t.style.display = 'none';
    }
  }

  message(text, kind = '') {
    const feed = this.el('feed');
    const div = document.createElement('div');
    div.className = 'msg ' + kind;
    div.textContent = text;
    feed.appendChild(div);
    while (feed.children.length > 5) feed.removeChild(feed.firstChild);
    clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => { feed.innerHTML = ''; }, 9000);
  }

  flashDamage() {
    this.damageEl.style.opacity = '0.45';
    setTimeout(() => { this.damageEl.style.opacity = '0'; }, 120);
  }

  showMissionIntro(mission) {
    const card = this.el('mission-card');
    this.el('mission-title').textContent = `Mission ${mission.id} — ${mission.title}`;
    this.el('mission-giver').textContent = mission.giver;
    this.el('mission-brief').textContent = mission.brief;
    this.el('mission-reward').textContent = 'Reward: ' + fmtCash(mission.reward);
    // In staged screenshot runs the card must survive slow rendering.
    const hideAfter = this.G.shotMode ? 30000 : 6000;
    card.style.display = 'block';
    setTimeout(() => { card.style.display = 'none'; }, hideAfter);
    this.message(`Mission ${mission.id}: ${mission.title}`, 'good');
  }

  showMissionComplete(mission) {
    this.message(`Mission complete: ${mission.title} — earned ${fmtCash(mission.reward)}!`, 'good');
    const card = this.el('mission-card');
    this.el('mission-title').textContent = 'Mission Complete!';
    this.el('mission-giver').textContent = mission.title;
    this.el('mission-brief').textContent = `You earned ${fmtCash(mission.reward)}. Costa Alba notices people like you.`;
    this.el('mission-reward').textContent = '';
    card.style.display = 'block';
    setTimeout(() => { card.style.display = 'none'; }, 5000);
  }

  showMissionFailed(mission, reason) {
    const card = this.el('mission-card');
    this.el('mission-title').textContent = 'Mission Failed';
    this.el('mission-giver').textContent = mission.title;
    this.el('mission-brief').textContent = reason + ' Press M to try again.';
    this.el('mission-reward').textContent = '';
    card.style.display = 'block';
    setTimeout(() => { card.style.display = 'none'; }, 5000);
    this.message(`Mission failed: ${mission.title} — ${reason}`, 'crime');
  }

  showScreen(id) {
    for (const s of ['screen-menu', 'screen-pause', 'screen-dead', 'screen-win']) {
      this.el(s).style.display = s === id ? 'flex' : 'none';
    }
    this.el('hud').style.display = id ? 'none' : 'block';
  }

  hideScreens() {
    this.showScreen(null);
  }

  update() {
    const G = this.G;
    const s = G.state;
    this.el('health-fill').style.width = Math.max(0, G.player.health) + '%';
    this.el('health-num').textContent = Math.ceil(G.player.health);
    this.el('cash').textContent = fmtCash(s.cash);
    this.el('clock').textContent = fmtClock(s.clockMinutes);
    // Wanted stars.
    const stars = this.el('stars');
    stars.textContent = '★'.repeat(s.wanted) + '☆'.repeat(CFG.maxWanted - s.wanted);
    stars.style.color = s.wanted > 0 ? '#ffd040' : 'rgba(255,255,255,0.35)';
    // Speed and radio.
    const speedEl = this.el('speed');
    if (G.player.inCar && G.player.car) {
      speedEl.style.display = 'block';
      speedEl.textContent = Math.round(Math.abs(G.player.car.speed) * 3.6) + ' km/h · ' + G.player.car.name;
    } else {
      speedEl.style.display = 'none';
    }
    this.el('radio').textContent = '♪ ' + G.audio.stationName() + (G.audio.radioOn ? '' : ' (off)');
    this.el('ammo').textContent = G.player.armed ? 'Ammo: ' + G.player.ammo : '';
    this.el('crosshair').style.display = (!G.player.inCar && s.mode === 'playing') ? 'block' : 'none';
    // Mission progress on the menu.
    const done = G.missions.completed.size;
    this.el('mission-progress').textContent = `Missions: ${done} / 9 complete · Cash: ${fmtCash(s.cash)}`;
    this.drawMinimap();
  }

  drawMinimap() {
    const G = this.G;
    const ctx = this.minimap;
    const S = 200;
    const scale = S / (CFG.half * 2 + 60);
    const toMap = (x, z) => [(x + CFG.half + 30) * scale, (z + CFG.half + 30) * scale];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#1c2a1a';
    ctx.fillRect(0, 0, S, S);
    // Ocean and sand.
    ctx.fillStyle = '#1e7fa8';
    const [, oy] = toMap(0, CFG.beachZ);
    ctx.fillRect(0, oy, S, S - oy);
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(0, oy - 6, S, 6);
    // Roads.
    ctx.strokeStyle = '#5a6068';
    ctx.lineWidth = 5;
    for (let c = -CFG.half; c <= CFG.half; c += CFG.roadGap) {
      const [x1] = toMap(c, 0);
      const [, y1] = toMap(0, c);
      ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(S, y1); ctx.stroke();
    }
    // Landmarks.
    ctx.fillStyle = '#ffd040';
    for (const key of Object.keys(PLACES)) {
      const p = PLACES[key];
      const [mx, my] = toMap(p.x, p.z);
      ctx.fillRect(mx - 2, my - 2, 4, 4);
    }
    // Mission beacon.
    const step = G.missions.currentStep();
    if (step && step.at) {
      const [mx, my] = toMap(step.at.x, step.at.z);
      const pulse = 5 + Math.sin(G.time * 4) * 2;
      ctx.strokeStyle = '#ffd040';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mx, my, pulse + 4, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffd040';
      ctx.beginPath(); ctx.arc(mx, my, 3, 0, Math.PI * 2); ctx.fill();
    }
    // Police dots.
    ctx.fillStyle = '#4080ff';
    for (const car of G.traffic.police) {
      const [mx, my] = toMap(car.x, car.z);
      ctx.beginPath(); ctx.arc(mx, my, 3, 0, Math.PI * 2); ctx.fill();
    }
    // Enemies.
    ctx.fillStyle = '#ff4030';
    for (const e of G.peds.enemies) {
      if (e.dead) continue;
      const [mx, my] = toMap(e.x, e.z);
      ctx.beginPath(); ctx.arc(mx, my, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow.
    const [px, py] = toMap(G.player.x, G.player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(Math.sin(G.player.heading), Math.cos(G.player.heading)) + Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath();
    ctx.fill();
    ctx.restore();
    // North label.
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '10px sans-serif';
    ctx.fillText('N', 4, 12);
  }
}
