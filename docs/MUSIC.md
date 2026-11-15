# Music that matches the track

## How the music is tied to the game

- The sequencer has no clock of its own. Every frame the game reports the ship's beat position (`Level.beatAt(z)`) and `BeatClock` (`src/audio/clock.ts`) schedules the sixteenths about to be reached. The same bar of music always plays over the same bar of road. A boost speeds the song up, a flip zone halves it, a practice restart resumes mid-song.
- Tempo is `speed × 5` BPM. Do not write a tempo into a track song; only free-running songs (the menu) have `bpm`.
- Each bar has an **energy** 1 to 3 (`Level.energyOf`): phrase base 1, 2, 2, 3 across the four phrases, plus one for a busy bar, minus one for a calm bar. Energy picks the drum pattern and bass pattern and switches arpeggio, pad and chord stabs on. Override per bar with `energy: '1122 2233 ...'` in the level definition when the default does not suit.
- Sound effects are part of the song: gems are bells that climb the current chord and wait for the next sixteenth, the jump is a flick up the chord, a flip-zone tap is a tom on the chord root, pad and finish are arpeggios in key.
- Halfway and record runs (`hype` 1, 2) add hats and an octave layer.

## A song is data (`src/audio/songs.ts`)

Every pattern is 16 characters, one bar of sixteenths.

| Part | Notation |
| --- | --- |
| drums | `x` hit, `X` accent, `o` ghost, `.` rest. Kits (`KITS`): `FOUR`, `BREAK`, `HALF`, `DNB`, `WAVE`, `DRIVE`, `STOMP`, `GLITCH`, `SLAM`, `MARCH`, `RAVE`, each with patterns for energy 1, 2, 3. `drums: 'hard'` on the song switches to the saturated kick, ringing snare and metal percussion |
| notes | `1`..`7` scale degree, `a`..`g` the same degrees an octave up, `A`..`G` an octave down, `-` hold, `.` rest |
| lead | degrees count from the key note. `A` = the hook, `B` = the answer, `C` = an optional third phrase (a breakdown), four bars each |
| bass, arp | degrees count from the root of the current chord (`1 3 5` are chord tones, `8` or `a` the octave) |
| chords | one digit per bar: the degree the diatonic triad is built on, e.g. `1637` |
| form | which lead phrase each four-bar phrase plays, e.g. `AABA`. It loops, so write eight phrases (`AABACABA`) if tracks may be longer than 16 bars |
| scales | `MINOR`, `MAJOR`, `PHRYGIAN`, `DORIAN`, `HARMONIC` (in harmonic minor chord 5 is major; avoid chords 3 and 7) |
| bass kinds | `sub`, `pluck`, `reese`, `acid`, `wobble`, and the distorted ones: `grit` (driven saw), `fm` (metallic), `growl` (snarling reese) |
| lead kinds | `square`, `saw`, `bell`, `tri`, and `grit` (distorted supersaw), `fm` (digital), `hollow` (two detuned squares) |

## The two sets

Every world has two songs. The **night set** (`drift`, `flare`, `pulse`, `line`, `well`, `rush`, `storm`, `point`, `neon`) is what the tracks play: dark industrial, distorted basses, hard drums, short menacing riffs. The **first set** (`cyan`, `solar`, `toxic`, `frost`, `gravity`, `ember`, `volt`, `zero`, `horizon`) is still in `SONGS`; put its name in a level's `song` to switch back.

## Writing a song for a track

1. Run `npm run level:report -- <track-id>`. Note the tempo, the energy column and the bars where the bot jumps.
2. Pick a key, scale and a four-chord loop that no other world uses in the same style. Give the world its own kit and bass kind (`sub`, `pluck`, `reese`, `acid`, `wobble`) and lead kind (`square`, `saw`, `bell`, `tri`).
3. Write the hook first (lead `A`). What makes it catchy: one short rhythmic cell repeated in bars 1 to 3 while the pitch moves with the chords, then a different fourth bar that leads back. Keep it singable: mostly steps, one leap, land on chord tones on beats 1 and 3.
4. Write `B` as a contrast: longer notes if `A` is busy, higher register, same key.
5. Bar 1 must already sound like the song. The player hears it after every crash.
6. Match the track: if a phrase is a flip zone, it plays at half tempo through a low-pass filter, so sustained notes work better there than fast runs. If the finale is the hardest part, phrase 4 is energy 3 and the hook is doubled an octave up automatically.
7. Keep octaves sane: lead roughly MIDI 60 to 88, bass 28 to 45.
8. Add the song name to the level (`song: 'name'`).
9. A bass with a lot of low end (`sub`, or any kind on a tonic below about G1) needs a line with rests in it, and a held bass needs the pad from energy 1, or `audio:check` reports BASS HEAVY.

## Generated songs (`src/audio/generate.ts`)

`generateSong(seed, { mood })` writes a whole song by the method above: one rhythm cell over three bars with the pitch following the chords, a turn in bar four, a contrasting answer, a sparse `C`. The same seed and mood always give the same song. Moods: `chase` (fast and aggressive), `night` (heavy, sparse hook), `cold` (broken beats, glassy leads).

A level stores only a name: `song: 'gen:4711:chase'` (`genName(4711, 'chase')`; without a mood the seed picks one). `GameAudio.playSong` resolves names through `songByName`, so generated names work wherever a built-in name does.

For the level editor (`src/editor/editor.ts` uses the first, second and fourth; pasting JSON is not wired up, see `docs/EDITOR.md`):

| Need | Call |
| --- | --- |
| "Generate music" button | pick a random seed, `GameAudio.playSong(genName(seed, mood), { energy })` to audition, store the name in `LevelDef.song` |
| list of built-in songs | `Object.keys(SONGS)`, with `describeSong(song)` as the label |
| paste a song as JSON | `registerSong(name, JSON.parse(text))` returns the problems as text; an empty list means the name is now playable |
| validate before saving | `checkSong(song)` (`src/audio/lint.ts`) |

`tests/songs.test.ts` checks every built-in song with `checkSong` and 300 seeds per mood of the generator: well formed, lead inside MIDI 60 to 88, bass tonic between G1 and D2, the hook rules, determinism.

## Checking a song without ears

Nobody can listen in the build environment. What can be checked:

- `npm run build && npm run preview` then `npm run audio:check`: renders every song offline at each energy and flags clipping, a mix that is too quiet or too loud, bass-heavy or dull. It also renders one generated song per mood; pass names to check others: `node scripts/audio.mjs http://localhost:4173/ gen:7:chase,gen:8:cold`.
- `npm test`: `tests/songs.test.ts` checks the notation of every song and the generator's rules.
- `node scripts/sync.mjs http://localhost:4173/`: the menu theme starts on the first touch, tracks switch song and tempo, no errors.
- `tests/clock.test.ts`: every sixteenth is scheduled once, on time, through frame jitter, speed changes and restarts.

Always say that how it actually sounds, and whether the hook is catchy, has not been heard by anyone yet.
