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
| drums | `x` hit, `X` accent, `o` ghost, `.` rest. Kits: `FOUR`, `BREAK`, `HALF`, `DNB`, `WAVE`, each with patterns for energy 1, 2, 3 |
| notes | `1`..`7` scale degree, `a`..`g` the same degrees an octave up, `A`..`G` an octave down, `-` hold, `.` rest |
| lead | degrees count from the key note. `A` = the hook, `B` = the answer, four bars each |
| bass, arp | degrees count from the root of the current chord (`1 3 5` are chord tones, `8` or `a` the octave) |
| chords | one digit per bar: the degree the diatonic triad is built on, e.g. `1637` |
| form | which lead phrase each four-bar phrase plays, e.g. `AABA` |

## Writing a song for a track

1. Run `npm run level:report -- <track-id>`. Note the tempo, the energy column and the bars where the bot jumps.
2. Pick a key, scale and a four-chord loop that no other world uses in the same style. Give the world its own kit and bass kind (`sub`, `pluck`, `reese`, `acid`, `wobble`) and lead kind (`square`, `saw`, `bell`, `tri`).
3. Write the hook first (lead `A`). What makes it catchy: one short rhythmic cell repeated in bars 1 to 3 while the pitch moves with the chords, then a different fourth bar that leads back. Keep it singable: mostly steps, one leap, land on chord tones on beats 1 and 3.
4. Write `B` as a contrast: longer notes if `A` is busy, higher register, same key.
5. Bar 1 must already sound like the song. The player hears it after every crash.
6. Match the track: if a phrase is a flip zone, it plays at half tempo through a low-pass filter, so sustained notes work better there than fast runs. If the finale is the hardest part, phrase 4 is energy 3 and the hook is doubled an octave up automatically.
7. Keep octaves sane: lead roughly MIDI 60 to 88, bass 28 to 45.
8. Add the song name to the level (`song: 'name'`).

## Checking a song without ears

Nobody can listen in the build environment. What can be checked:

- `npm run build && npm run preview` then `npm run audio:check`: renders every song offline at each energy and flags clipping, a mix that is too quiet or too loud, bass-heavy or dull.
- `node scripts/sync.mjs http://localhost:4173/`: the menu theme starts on the first touch, tracks switch song and tempo, no errors.
- `tests/clock.test.ts`: every sixteenth is scheduled once, on time, through frame jitter, speed changes and restarts.

Always say that how it actually sounds, and whether the hook is catchy, has not been heard by anyone yet.
