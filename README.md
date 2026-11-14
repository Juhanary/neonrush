# Neonrush

Futuristic neon hovercraft arcade game for phones and tablets: continuous forward movement, a chase camera, floating roads, gaps, blocks, pads and gems. Simple geometry, heavy glow.

## Run

```bash
npm install
npm run dev          # local dev server (open the printed network URL on a phone)
npm test             # simulation tests, including a bot that proves every level can be finished
npm run build        # production build in dist/
npm run build:single # one self-contained HTML file in dist-single/
```

## Controls

- Touch: drag with the left thumb to steer, tap the right side to jump (hold to keep jumping).
- Keyboard: A/D or arrows steer, Space jumps, R restarts, Esc pauses.
- Practice mode (menu): runs restart from the last checkpoint, which is saved per track. The two arrows next to the pause button step back one checkpoint or to the start.
- Guide (menu): explains every tile and mechanic.

## Layout

| Folder | Role |
| --- | --- |
| `src/core` | Gameplay simulation, tuning and level data. No engine, DOM or audio imports. |
| `src/render` | Three.js presentation: track, ship, particles, background, camera, bloom. |
| `src/audio` | Synthesised music and effects (WebAudio). |
| `src/game` | Fixed-step loop, input, save data. |
| `src/ui` | DOM HUD and menus. |
| `tests` | Vitest: determinism, jump distance, level completability at two reaction speeds, jump pads, flip zones, practice checkpoints. |
| `scripts` | Headless Chrome smoke tests and screenshots. |

See `docs/ARCHITECTURE.md` for the design rules and the notes on a later Godot port.
