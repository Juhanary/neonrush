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
  fallY: -5,

  /** Moving road ('m'): sideways offset = moveAmp * sin(time * moveW - row * moveK). */
  moveAmp: 2.4,
  moveW: 3.0,
  moveK: 0.25,
  /** Steering grip on ice, as a fraction of normal. */
  iceGrip: 0.16,
  /** Half width of a rail tile ('|'). */
  railHalf: 0.5,
  /** Gravity-flip zones: upward pull, downward kick per tap, and the height where the ship is lost. */
  flipGravity: 26,
  flipThrust: 8.5,
  flipCeil: 9.5,
  /** Inside a zone the ship slows to this fraction of the track speed, braking hard on the way in. */
  flipSpeed: 0.55,
  flipBrake: 45,

  /** Practice mode: minimum rows between two checkpoints. */
  checkpointGap: 6,

  /** Fixed simulation step. */
  dt: 1 / 120,
  /** Floor rows appended after the finish line. */
  runway: 8,
} as const;

export const ROAD_W = CFG.lanes * CFG.tileW;
