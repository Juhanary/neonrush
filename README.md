# Neonrush

Futuristic neon hovercraft arcade game for phones and tablets: continuous forward movement, a chase camera, floating roads, gaps, blocks, pads and gems. Simple geometry, heavy glow.

## Run

```bash
npm install
npm run dev          # local dev server (open the printed network URL on a phone)
npm test             # simulation tests, including a bot that proves every level can be finished
npm run build        # production build in dist/
npm run build:single # one self-contained HTML file in dist-single/
npm run level:report # every track bar by bar on the beat grid (add -- <track-id> for one)
npm run audio:check  # offline render of every song: clipping and balance (needs the preview server)
```

## Controls

- Touch: drag with the left thumb to steer, tap the right side to jump (hold to keep jumping).
- Keyboard: A/D or arrows steer, Space jumps, R restarts, Esc pauses.
- Practice mode (menu): runs restart from the last checkpoint, which is saved per track. The two arrows next to the pause button step back one checkpoint or to the start.
- Guide (menu): explains every tile and mechanic.
- Editor (menu): build your own tracks from figures and blocks, add your own music (its tempo sets the speed), let a bot check the track, test drive it.

## Layout

| Folder | Role |
| --- | --- |
| `src/core` | Gameplay simulation, tuning and level data. No engine, DOM or audio imports. |
| `src/render` | Three.js presentation: track, ship, particles, background, camera, bloom. |
| `src/audio` | Synthesised music and effects (WebAudio). |
| `src/game` | Fixed-step loop, input, save data. |
| `src/ui` | DOM HUD and menus. |
| `src/editor` | The level editor screen. |
| `tests` | Vitest: determinism, jump distance, level completability at two reaction speeds, jump pads, flip zones, practice checkpoints. |
| `scripts` | Headless Chrome smoke tests and screenshots. |

See `docs/ARCHITECTURE.md` for the design rules and the notes on a later Godot port, `docs/LEVELS.md` for building tracks on the beat grid, `docs/MUSIC.md` for writing songs that match them, `docs/EDITOR.md` for the level editor and the music analysis, and `docs/TESTING.md` for the test routine.
