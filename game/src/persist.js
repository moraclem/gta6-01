// Costa Alba — persistence: one localStorage slot for cash, health, mission
// progress, position and clock. Saving never blocks play: it is a plain object.
export const SAVE_KEY = 'costa-alba-save-v1';

export function hasSave() {
  try { return !!window.localStorage.getItem(SAVE_KEY); } catch { return false; }
}

export function saveGame(state) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch { return false; }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') return null;
    return data;
  } catch { return null; }
}

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
