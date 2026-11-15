# Testing a track

Run these in order after any change to `src/core`, a track or a song. Stop at the first failure.

| Step | Command | What it proves |
| --- | --- | --- |
| 1 | `npx tsc --noEmit` | types |
| 2 | `npm test` | see below |
| 3 | `npm run level:report -- <track-id>` | read the bar chart and the warnings |
| 4 | `npm run build && npx vite preview --port 4173 &` | production build serves |
| 5 | `node scripts/flow.mjs http://localhost:4173/ /tmp/shots` | touch steering, jump, crash, restart, finish panel |
| 6 | `node scripts/practice.mjs http://localhost:4173/ /tmp/shots` | practice mode end to end |
| 7 | `node scripts/tour.mjs http://localhost:4173/ /tmp/shots <index> "<row>[:x[:y]] ..."` | frames at chosen rows; look at them |
| 8 | `npm run audio:check` and `node scripts/sync.mjs http://localhost:4173/` | mix levels, music starts and follows |

## What `npm test` covers

- **Completable**: a bot deciding every 50 ms finishes every track; so does one deciding every 100 ms.
- **Rhythm**: a bot that may press jump only within ±0.17 beat of a beat finishes every track. Tracks are 16 whole bars; flip zones sit on bar lines; pads, boosts and floor gems are on beat rows.
- **Jump pads** land with no input when entered early, in the middle and late.
- **Flip zones**: no tapping loses the ship in 0.8 to 1.4 s; holding does not help; tapping exactly once per beat holds altitude through the whole zone; a calm rhythm under two taps a second gets through; gravity returns.
- **Practice checkpoints**: enough of them, never more than 34 rows apart, none kills at once, and from each one the bot gets past the checkpoint after next.
- **Beat clock**: exact, ordered scheduling through jitter, slow frames, speed changes and restarts.
- **Songs**: every built-in song is well formed and every track names an existing song of its own; the generator is deterministic and keeps to the hook rules for 300 seeds in each mood.
- **Sim**: determinism and basic jump distance.

## Reading a failure

`stuck at row R (bar B)` means no input sequence got past row R. Open the report for that track and look at bar B and the one before it. Usual causes: a take-off needed off the beat, two take-offs in consecutive beats, a wall crossing with too few beats, a pad landing on a gap.

## What these tests cannot tell you

- Whether a human finds it fair or fun. The bots have perfect knowledge.
- Frame rate on a real phone. Headless Chrome here renders in software at about 5 fps.
- How the music sounds.

Report those three as untested every time, and ask for a play test on the device.
