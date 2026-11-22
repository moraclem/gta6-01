// Costa Alba — entry program for make.fun competition gta6-01.
//
// The game is plain static files under game/ (an index.html plus ES modules,
// with three.js vendored as a minified build). This program hands it in: it
// copies game/ and screenshots/ from beside this file into the output
// directory and writes dossier.json there with the vendored make.fun library.
//
// It runs on Node 22 with the standard library only, twice, and both runs
// must write identical bytes. All paths are resolved from this file's own
// directory, never from the working directory, so the grader can invoke it
// from anywhere. Outside the grader, MAKEFUN_OUTPUT_DIR stands in for
// /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// Caps mirror the gate in the competition rules: at most 4 screenshots of
// 256 KiB each, game/ at most 993 entries and 48 MiB, and a 160 KiB dossier.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
