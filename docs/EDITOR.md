# The level editor

Players build their own tracks and drive them to their own music. Entry: `+ NEW TRACK` or `EDITOR` in the menu; the pen on a track card edits that track.

## What the player does

1. **Build.** The track is shown from above, driving direction to the right: five lanes, three columns to a beat, twelve to a bar. Lighter columns are beat rows. A new track is one empty section (four bars); `+ SECTION` after the finish line adds another. Building starts with single blocks.
   - **Figures** are whole beats and always land on a beat: jump, wall, spikes, jump pad, long jump, zigzag, skyway, boost jump and so on. Tap a beat to place one; one-sided figures face the side that was tapped.
   - **Blocks** are single tiles, painted with a finger: floor, gap, block, spikes, the four gems, jump pad, boost, ice, moving road, rail. Painting a tile onto itself wipes it back to floor. `FLIP ZONE` toggles a gravity-flip bar.
   - Two fingers (or the `MOVE` tool, the strip above the lanes, the minimap) scroll. Undo and redo keep 80 steps.
2. **Music.** `MUSIC` → choose a file. It is analysed and the track takes its tempo: speed = BPM / 5, as everywhere in the game. The strip above the lanes then shows the song beat by beat (height = loudness, colour = intensity of the bar, dot = strong hit). `LISTEN` plays the song with a click on every beat for checking the grid; tempo, start point (by beat or bar), half a beat and ±10 ms can be corrected. Without a file the track plays a game song at a chosen speed: any built-in song, or `NEW SONG` in a mood (chase, night, cold), which has the generator of `docs/MUSIC.md` write one (`genName(seed, mood)`, checked with `checkSong`; the track stores only the name `gen:<seed>:<mood>`). `LISTEN` auditions the song at the track's tempo, stepping through every intensity in eight bars. With a file, the game song is the backup.
3. **AUTO** fills every bar that is still plain floor with figures that follow the intensity of the music, and lets the rhythm bot prove the result. Built bars are never touched.
4. **CHECK** lets the bots play: first pressing jump only on the beat, then freely. The result is "can be finished", "passable but a jump is off the beat in bar N", or "stuck in bar N" with the spot marked. Yellow corners are rule hints (`core/rules.ts`), shown while building.
5. **TEST** drives the track from the checkpoint at the left edge of the view, restarting from checkpoints, recording nothing. Back returns to the editor at the spot.

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
