// Costa Alba — the program that hands this entry in.
//
// It runs on Node 22 with the standard library only. It copies this
// repository's game/ (the whole playable game: static files, no build step,
// no network request) and screenshots/ (four real renders of the game) from
// beside this file into the output directory, then writes
// /output/dossier.json with the vendored make.fun library — the summary the
// judge reads. Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in
// for /output, so a local check looks like:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The game itself is an original open-world crime game: Costa Alba, a
// sun-soaked coastal city you explore on foot and by car, with traffic and
// pedestrians, cars to steal, a wanted level with police and a helicopter,
// nine story missions, combat, a HUD with a minimap, a start screen, saves
// and synthesized radio. Serve it locally with `node serve.ts`, then open
// http://localhost:8080.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Every path below is resolved against this file's own directory, never
// against the process working directory, so the program behaves the same
// wherever it is launched from.
const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');

// Refuse to hand in a broken entry: the game must exist and hold an entry
// point, and the screenshots must be real files, not placeholders.
if (!existsSync(join(gameDir, 'index.html'))) {
  throw new Error('game/index.html is missing — nothing to hand in');
}
const shotNames = existsSync(shotsDir) ? readdirSync(shotsDir).filter((n) => !n.startsWith('.')) : [];
if (shotNames.length < 3 || shotNames.length > 4) {
  throw new Error(`expected 3 or 4 screenshots, found ${shotNames.length}`);
}
for (const name of shotNames) {
  const size = statSync(join(shotsDir, name)).size;
  if (size > 262144) throw new Error(`screenshot ${name} is ${size} bytes, over the 256 KiB cap`);
}

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(shotsDir)) cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes
// the bytes; the others refuse an entry the scorer would refuse (more than
// 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB
// of game files, in all, or a path under game/ over 1000 bytes: game/ counts
// beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log(`Costa Alba handed in: ${shotNames.length} screenshots, dossier written to ${join(out, 'dossier.json')}`);
