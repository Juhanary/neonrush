/**
 * Gameplay tuning. Units are metres and seconds, Y is up.
 * This file (and everything in src/core) has no engine or DOM dependency,
 * so the values and logic port 1:1 to Godot (GDScript/C#).
 */
export const CFG = {
  lanes: 5,
  tileW: 2.4,
  tileL: 4,
  blockH: 1.6,
  /**
   * Spikes ('x'): red pyramids that destroy the ship on contact. Unlike a block they cannot be landed on,
   * so they are always jumped. The hitbox is the ship's footprint shrunk by `spikeInset` on every side.
   */
  spikeH: 1.0,
  spikeInset: 0.2,
  /**
   * Air block ('n'): a block floating over plain road. The ship drives under it; touching its front, sides
   * or underside (a jump from the road, a pad flight, the drift in a flip zone) destroys the ship. Its top is
   * a platform: a ship that comes down on it from above (a jump from the top of a block reaches 4.1 m, one
   * from the road only 2.5 m) lands and drives across. It spans airLo..airHi above the road and the
   * ship is `shipH` tall, so a ship on the ground clears it by 0.8 m. Same footprint rule as spikes.
   */
  airLo: 1.6,
  airHi: 2.9,
  shipH: 0.8,

  boostSpeed: 37,
  boostTime: 1.1,
  speedAccel: 60,
  speedDecel: 14,

  steerSpeed: 11.5,
  steerAccel: 120,

  gravity: 62,
  jumpVel: 17.5,
  padJumpVel: 30,
  coyote: 0.09,
  jumpBuffer: 0.12,

  shipHalfW: 0.55,
  shipHalfL: 0.9,
  /** Ledges up to this height are stepped onto instead of crashing. */
  stepTol: 0.3,
  /**
   * Ledge assist: a ship in the air whose front meets the top of a block at most this far above it is lifted
   * onto the top instead of crashing, so a jump that comes up a little short still lands. Not for jumps from
   * the road into an air block: its top only takes `airLedge`, and a jump from the road peaks at 2.5 m.
   */
  ledgeAssist: 0.7,
  airLedge: 0.35,
  fallY: -5,

  /**
   * The beat grid. One beat is `rowsPerBeat` rows of track, whatever the speed, so tempo = speed * 60 / 12 m.
   * Beat 0 sounds when the ship's centre is at `beatZ0` (the spawn point), i.e. in the middle of row 0;
   * every later beat falls in the middle of a row whose index is a multiple of rowsPerBeat (a "beat row").
   * Music, visuals, moving roads and flip-zone gravity are all derived from this grid.
   */
  rowsPerBeat: 3,
  beatsPerBar: 4,
  beatZ0: 2,

  /**
   * Moving road ('m'): sideways offset = moveAmp * sin(beat * moveBeat - row * moveK), where `beat` is the
   * ship's beat position. With these constants the road under the ship sways once every two bars.
   */
  moveAmp: 2.4,
  moveBeat: Math.PI / 2,
  moveK: Math.PI / 12,
  /** Steering grip on ice, as a fraction of normal. */
  iceGrip: 0.16,
  /** Half width of a rail tile ('|'). */
  railHalf: 0.5,
  /**
   * Gravity-flip zones: downward kick per tap, and the height where the ship is lost.
   * The upward pull is not a constant: Level.flipGravity sets it so that one tap per beat holds altitude.
   */
  flipThrust: 8.5,
  flipCeil: 9.5,
  /** Inside a zone the ship slows to this fraction of the track speed (so the music runs at half tempo), braking hard on the way in. */
  flipSpeed: 0.5,
  flipBrake: 45,

  /** Practice mode: minimum rows between two checkpoints. */
  checkpointGap: 6,

  /** Fixed simulation step. */
  dt: 1 / 120,
  /** Floor rows appended after the finish line. */
  runway: 8,
} as const;

export const ROAD_W = CFG.lanes * CFG.tileW;
/** Metres of track per beat, and rows per bar. */
export const BEAT_LEN = CFG.rowsPerBeat * CFG.tileL;
export const BAR_ROWS = CFG.rowsPerBeat * CFG.beatsPerBar;
