# Building a track

Neonrush is a rhythm game: the road is the sheet music. Work in bars and beats, never in loose rows.

## The grid

| Unit | Size | Notes |
| --- | --- | --- |
| row | 4 m, 5 lanes | one string of 5 characters |
| beat | 3 rows | the first row of a beat is the **beat row**; the beat sounds while the ship is in the middle of it |
| bar | 4 beats = 12 rows | one `bar(...)` call in `src/core/levels.ts` |
| track | 16 bars = 192 rows | four phrases of four bars, like the song |

Tempo is not chosen, it follows from speed: `BPM = speed × 5` (24 m/s = 120 BPM, 33 m/s = 165 BPM). Speeds so far: 24, 26, 28, 29, 30, 31, 32, 33.

Tile characters: `.` gap, `=` floor, `#` block, `^` jump pad, `>` boost pad, `o` gem, `O` high gem, `*` gem over a gap, `+` gem on a pad arc, `m` moving road, `i` ice, `|` rail.

## Rules (the tests enforce the ones marked T)

1. **Take off on the beat.** A gap, or a block to jump, starts on the row right after a beat row. (T: a bot that may only press jump within ±0.17 beat of a beat must finish the track.)
2. **A jump is longer than a beat** (1.1 beats at 120 BPM, 1.5 at 165). The beat right after a take-off is never another take-off. Leave two beats between jumps.
3. **Pads, boosts and floor gems sit on beat rows** (T). Air gems (`*`, `+`) go in the rows after the beat row.
4. **Walls with an opening sit on beat rows**, so the ship passes through on the beat. Give at least two beats to cross two lanes.
5. **An idea lasts whole bars.** Flip zones start and end on bar lines (T) and last two bars.
6. **Jump pads land straight ahead with no steering**, even when entered late (T). Use the `pad()` helper: 4 gap rows at 24 to 26 m/s, 5 above that.
7. **Lane changes and side jumps in every track.** A jump carries the ship about 2.5 lanes sideways. Shifting roads move one lane per beat (two beats per lane on ice).
8. **Breathers.** At least one beat of full floor after every hard figure; two full rows in one lane every 30 rows at most, which is what creates practice checkpoints (T).
9. **Nothing new without a hint** in the track where it first appears (`h('key', lead)` plus a text key in `src/ui/i18n.ts`, English and Finnish).
10. **Three-row gaps (`leap`) need 28 m/s or more.** A boost jump is four gap rows, taken from the second beat row after the pad (`boost()` is a whole bar).

## Helpers in `src/core/levels.ts`

`run(row, beats)`, `on(first, rest)`, `hop(from, air)`, `leap()`, `mount()`, `pad(air, gapRows)`, `boost(air)`, and `bar(...)`, which throws unless it gets exactly 12 rows. Hand-written beats are plain arrays of three rows, e.g. `[F, F, '#####']`.

Figures that work (one line = one bar):

```ts
bar(run(), hop(), run(), hop())                                   // two jumps, beats 2 and 4
bar(run('==...'), run('.==..'), run('..==.'), run('...=='))       // staircase, one lane per beat
bar(run('==...'), hop('=o...'), run('...=='), run())              // side jump across three lanes
bar(on('###=='), run(), on('==###'), run())                       // slalom through two walls
bar([F, F, '###..'], run('###..'), run('.###.'), run('..###'))    // skyway: jump up, drive across the tops
bar([F, F, '#####'], run('#####'), ['#####', '#####', G], ['#####', F, F])  // hop between block tops
bar(run('.|...'), run('.||..'), run('..|..'), run('..||.'))       // rail switching
bar(pad('..+..'), run(), run())                                   // jump pad (two beats) and landing
bar(boost())                                                      // boost pad and its long jump
```

## Procedure

1. Decide the theme (which mechanics), the speed, and the song (`docs/MUSIC.md`).
2. Sketch the 16 bars as four phrases: introduce, develop, twist, finale. Bar 1 is always easy: the player restarts here constantly.
3. Write the bars with the helpers. Mirror figures left and right so both hands of the road get used.
4. `npm run level:report -- <track-id>` and read the chart: every bar on the beat grid, its music intensity (`e`), where the rhythm bot jumped, checkpoints, warnings.
5. `npm test`. A failure names the row and bar where a bot got stuck. Fix the figure, do not widen the bot.
6. Look at it: `node scripts/tour.mjs http://localhost:4173/ /tmp/shots <index> "<row> <row> ..."`.
7. Register the track in `LEVELS`, add a palette in `src/render/palette.ts` (the obstacle hue must contrast with floor and edge and is never used for decoration), and a song.
8. Say plainly that difficulty for a human is untested until someone plays it on a phone.

## Mistakes already made once

- Block wall two rows deep right after the beat row: the ship has no height yet. Put the wall on the third row of the beat (`[F, F, wall]`).
- A jump landing and the next take-off in the same beat (hop on beat 4, `mount` on beat 1 of the next bar).
- A checkpoint between a boost pad and its long jump (the finder now skips 12 rows after a boost).
- Moving roads that sway faster than the ship can steer. They follow the beat: one full sway under the ship per two bars.
