// Costa Alba — save and load through localStorage.
// One clear job: persist cash, mission progress and position, nothing else.

import { CFG } from './config.js';

export function saveGame(G) {
  try {
    const data = {
      cash: G.state.cash,
      completed: [...G.missions.completed],
      health: G.player.health,
      ammo: G.player.ammo,
      x: G.player.x,
      z: G.player.z,
      clockMinutes: G.state.clockMinutes,
      savedAt: Date.now(),
    };
    localStorage.setItem(CFG.saveKey, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(CFG.saveKey);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try { localStorage.removeItem(CFG.saveKey); } catch { /* storage unavailable */ }
}
