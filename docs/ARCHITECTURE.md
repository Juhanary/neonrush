# Architecture

## Rules

1. `src/core` is the game. It is deterministic, runs at a fixed 120 Hz step and imports nothing outside itself.
2. Everything else is presentation. It reads `Sim.s` and reacts to `Sim.events`; it never changes gameplay state.
3. A ship's looks (`src/render/ship.ts`) are separate from its movement (`src/core/sim.ts`). New bodies are new factories in `SHIPS`.
4. Levels are plain text rows (`src/core/levels.ts`), one character per lane.
5. Each world has one palette (`src/render/palette.ts`). The obstacle hue is never used for decoration.

## Frame flow

```
Input.sample() -> Sim.step() x N (fixed dt) -> Sim.events -> View.onEvent / GameAudio.onEvent / Game mode
                                             -> interpolated Pose -> View.frame()
```

## Level characters

| Char | Meaning |
| --- | --- |
| `.` | gap |
| `=` | floor |
| `#` | block: crash from the front, slide along the side, land on top |
| `^` | jump pad |
| `>` | boost pad |
| `o` | floor with a gem |
| `O` | floor with a high gem (needs a jump) |
| `*` | gap with a gem in the air |
| `+` | gap with a gem high on a jump-pad arc |
| `m` | moving road: slides sideways as `moveAmp * sin(time * moveW - row * moveK)` (sim and shader share the constants) |
| `i` | ice: steering grip drops to `iceGrip` |
| `\|` | rail: a narrow beam in the middle of the lane |

Gravity-flip zones are row ranges (`LevelDef.flips`). Inside one, gravity pulls up, each tap kicks the ship down, and rising past `flipCeil` loses the ship. Tutorial callouts are `LevelDef.hints` (text keys, translated in `src/ui/i18n.ts`).

Tiles are 2.4 m wide and 4 m long, five lanes. At the base speed of 24 m/s one beat (120 BPM) is three rows.

## Porting to Godot

The split was made so a Godot version reuses the design instead of re-deriving it.

| Here | Godot 4 |
| --- | --- |
| `core/config.ts` | a `Resource` or autoload with the same constants (metres, seconds, Y up) |
| `core/sim.ts` `step()` | one script called from `_physics_process` with physics ticks set to 120; do not replace it with `CharacterBody3D` physics or the feel changes |
| `SimEvent` | signals with the same names |
| `core/levels.ts` rows | load the same strings from a text or JSON resource; build tiles with `MultiMeshInstance3D` |
| sim Z (forward, positive) | rendered at `-Z`, which is also Godot's forward axis, so positions map 1:1 |
| tile / sky GLSL | `shader_type spatial` (unshaded) and a sky shader; the maths carries over |
| bloom | `WorldEnvironment` glow |
| particles | `GPUParticles3D` or the same pooled CPU approach |
| `tests/levels.test.ts` bot | port with the sim (GUT) so levels stay provably finishable |

To keep the port cheap: no gameplay logic in `src/render`, no browser APIs in `src/core`, and levels stay data.
