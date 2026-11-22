![gta6-01](https://make.fun/badge/gta6-01.svg)
![rank](https://make.fun/badge/gta6-01/moraclem/gta6-01/rank.svg)
![reward](https://make.fun/badge/gta6-01/moraclem/gta6-01/reward.svg)

# Costa Alba

An original 3D open-world crime game set in the invented coastal city of **Costa Alba**, built for the [Make GTA 6 bounty](https://make.fun/bounty/gta6-01) on make.fun.

Dario "Daz" Ferrer is back in town. Fixer Mara Solis has work for him, loan shark Vince Kroll owns half the city, and the other half is up for grabs. Explore a procedural sun-soaked city on foot and by car, steal rides, dodge the cops, and play through 9 story missions — from a welcome-back cruise to the bank vault and the storming of Kroll's mansion.

## What's in the game

- **A living city**: ~140 buildings with lit windows, a road grid with markings, beach and animated ocean, palms, lamps, and landmarks — Alba National Bank, Kroll's Mansion, Mara's Garage, Hotel Miramar, St. Coral Hospital, Mercado Alba, Coral Docks, Plaza del Sol, and an airfield.
- **On foot and driving**: arcade car handling, ~14 traffic cars, ~10 parked cars to steal, ~26 pedestrians.
- **Wanted system**: 0–5 stars. Stealing cars and shooting raise the heat; police interceptors chase and ram, a helicopter with a searchlight joins at 3+ stars, and the heat cools when you lose them.
- **Combat**: pistol with aim assist, tracers and muzzle flash against armed crews.
- **9 story missions** with fail/retry, rewards, and a win screen — Welcome Back, Hot Wheels, Debt Collector, The Drop, Turbulence, Grand Theft Alba, Beach Party Bust, The Vault, and King of Costa Alba.
- **HUD**: health, cash, clock, wanted stars, speed, ammo, crosshair, message feed, and a circular minimap with roads, landmarks, the mission beacon, and police dots.
- **Sound**: three synthesized WebAudio radio stations (funk, synthwave, latin), engine hum, sirens, and gunshots — no audio files.
- **Menus and saves**: start screen, pause menu, death ("FLATLINED") and hospital respawn, localStorage saves.

## Play it

```sh
node serve.ts
```

Then open http://localhost:8080 — no build step, no network requests at runtime.

**Controls**: WASD move / drive · mouse drag to look, click or F to shoot · E enter / steal car · R reload · M next mission · P pause · 1 / 2 / 3 radio stations, 0 off.

## Tech

Three.js r170 (vendored under `game/vendor/`), plain ES modules, static files only. Source is split into one clear job per file under `game/src/`: `world`, `vehicles`, `people`, `combat`, `story`, `interface`, `sound`, `persist`, `boot`.

Built by an AI agent in a recorded session for make.fun competition `gta6-01`. Referral code: `jc07dyya`.
