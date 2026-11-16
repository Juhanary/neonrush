# The level editor

Players build their own tracks and drive them to their own music. Entry: `+ NEW TRACK` or `EDITOR` in the menu; the pen on a track card edits that track.

## What the player does

1. **Build.** The track is shown from above, driving direction to the right: five lanes, three columns to a beat, twelve to a bar. Lighter columns are beat rows. A new track is one empty section (four bars); `+ SECTION` after the finish line adds another.
   - **Blocks** are single tiles, placed with a tap or painted with a finger: floor, gap, block, spikes, the gem, jump pad (arrow up), boost (arrow forward), air block, ice, moving road, rail. Painting a tile onto itself wipes it back to floor.
   - **The gem** is one tool. While it is selected its three heights show next to it: LOW (on the road), MID (jump height) and HIGH (needs a block top, a jump pad or a flip zone). A gem in the air keeps the gap under it; a LOW gem always gets floor. A column holds one gem: placing another moves it. Tapping a gem with its own height takes it away. Tracks stored with several gems in a column are reduced to one when loaded (`oneGemPerRow`).
   - **Air block** (`n`) floats over the road: the ship drives under it and is destroyed if it touches it (a jump, a pad flight). See `CFG.airLo`, `airHi`, `shipH`.
   - **Flip zone**: drag over the columns where gravity is reversed. Any length from one column up (the first three columns of the track excepted); stored as `flipRows`.
   - Two fingers, the `MOVE` tool, the strip above the lanes or the wide bar under the track scroll. Undo and redo keep 80 steps.
   - The figure stamps and the automatic fill (`core/figures.ts`, `core/auto.ts`) are no longer in the editor's interface after player feedback (16.11.): building is one block at a time. The code and its tests remain.
2. **Music.** `MUSIC` → choose a file. It is analysed and the track takes its tempo: speed = BPM / 5, as everywhere in the game. The strip above the lanes then shows the song beat by beat (height = loudness, colour = intensity of the bar, dot = strong hit). `LISTEN` plays the song with a click on every beat for checking the grid; tempo, start point (by beat or bar), half a beat and ±10 ms can be corrected. Without a file the track plays a game song at a chosen speed: any built-in song, or `NEW SONG` in a mood (chase, night, cold), which has the generator of `docs/MUSIC.md` write one (`genName(seed, mood)`, checked with `checkSong`; the track stores only the name `gen:<seed>:<mood>`). `LISTEN` auditions the song at the track's tempo, stepping through every intensity in eight bars. With a file, the game song is the backup.
3. **CAN IT BE DONE?** lets the bots play: first pressing jump only on the beat, then freely. The result is "can be finished", "passable but a jump is off the beat in bar N", or "stuck in bar N" with the spot marked. When the track can be finished on the beat, a third bot must also collect every gem in one run (`Solver` with `gems: true`); if it cannot, the result is "the bot cannot get the gem in bar N" and that gem is framed in red. The gem search stops after `GEM_STALL` positions without progress, so the message means the bot found no way, not a proof that none exists. Yellow corners are rule hints (`core/rules.ts`), shown while building.
4. **TEST DRIVE** drives the track from the checkpoint at the left edge of the view, restarting from checkpoints, recording nothing. Back returns to the editor at the spot.

The top bar is icon-over-word buttons: MENU, UNDO, REDO, ZOOM, MUSIC, TRACK (world, length, delete), CAN IT BE DONE?, TEST DRIVE. The music sheet is two boxes: A, a game song (tap to choose and hear, or have a new one written in a mood, and the track speed), and B, a song of your own (choose a file, listen with a click, fine tuning folded away).

Tracks are saved on every change. Editing a track clears its records.

## Code

| Part | File |
| --- | --- |
| Track model, energy from music, flip bars, defensive loading | `src/core/custom.ts` |
| Figure helpers (shared with the official tracks), editor stamps, automatic fill | `src/core/figures.ts` |
| Fill + proof by the rhythm bot, backing off where it gets stuck | `src/core/auto.ts` |
| The bot, runnable in slices so the page stays responsive | `src/core/solve.ts` |
| Beat rules as hints | `src/core/rules.ts` |
| Music analysis (no audio API, unit tested) | `src/audio/analyze.ts` |
| Playing a file tied to the ship, click preview | `src/audio/audio.ts` (`syncTrack`, `preview`) |
| Game songs for a track: list, generator, validation | `src/audio/generate.ts` (`songByName`, `genName`, `describeSong`), `src/audio/lint.ts` |
| Storage: tracks in localStorage, files in IndexedDB; decoded-file cache | `src/game/custom-store.ts`, `src/game/tracks.ts` |
| The editor screen | `src/editor/editor.ts`, `draw.ts`, `editor.css` |
| Menu cards, test drive, records | `src/game/game.ts` (`playCustom`, `toEditor`), `src/ui/ui.ts` |

Everything in `src/core` stays free of browser APIs, so custom tracks port with the rest (see ARCHITECTURE.md).

## Music analysis

Assumes one steady tempo and four beats to a bar.

1. Mono, about 11 kHz, 23 ms windows, 100 per second. Flux = how much the spectrum grew since the last window.
2. Coarse tempo: autocorrelation of the flux at one, two and four beats, over the playable octave 95 to 190 BPM (speeds 19 to 38 m/s). Other tempos are folded into it by halving or doubling.
3. Fine tempo: fold the flux at the beat length and search in 0.005 BPM steps for the sharpest pile-up, then fit a straight line through the onsets that sit on the beats.
4. Phase: the fullest bin of the fold, with the bass band weighing most. Then beat against off-beat: what sits on the beats changes through the bar (kick, snare, chords), what sits between them (hi-hats, off-beat bass) is the same every time.
5. Bar line: the beat position with the most bass and the biggest loudness steps. The track starts on the first such beat after the silence at the start of the file.
6. Per beat: loudness and hit strength, one digit each. Per bar: intensity 1 to 3 relative to the quiet and loud bars of the part the track uses (`musicEnergy`). That drives the strip, the automatic fill and the arrangement of the backup song.

## Playing the file

The file is not on its own clock. Each frame the game says where the ship is in beats and how fast it moves; the file plays at ship speed / track speed, trimmed by up to 1.2 % to pull the file position onto the ship's, and is restarted at the right spot if it is more than 90 ms off. So a boost bends the song up, a flip zone drops it to half speed with the filter on, and a practice restart starts the song at that checkpoint. Output latency reported by the browser is compensated.

Sound effects still play in the key of the backup song, not of the file: the key of the file is not analysed.

## Limits

- Tempo changes inside a song are not followed.
- The file is stored on the device only. If storage refuses it, it lasts for the session; if it is missing, the backup song plays.
- A decoded song takes tens of megabytes of memory while it plays.
- Tracks cannot be shared between devices yet.
- Pasting a song as JSON (`registerSong`) is not in the editor: a registered song lives only until the page is closed, so the track would need to carry the song itself.

## Testing

`npm test` covers the analysis on synthetic songs (`tests/analyze.test.ts`) and solver, rules, figures, automatic fill and the track model (`tests/custom.test.ts`). Headless:

| Command | What it shows |
| --- | --- |
| `node scripts/editor.mjs http://localhost:4173/ /tmp/shots` | the whole editor flow with a generated WAV file, frames of every step |
| `node scripts/tracksync.mjs http://localhost:4173/` | how far the file is from the ship's beat position while driving |
| `node scripts/analyse.mjs http://localhost:4173/ [indexes]` | the analysis on the built-in songs rendered as full mixes (slow) |

Not testable here: real music files in MP3 or M4A, how the result sounds, memory and decoding time on a phone, the file picker and storage inside an embedded page.
