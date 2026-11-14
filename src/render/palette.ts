/** One palette per world. Obstacles (block) always contrast with floor/edge and decor never uses the block hue. */
export interface Palette {
  top: number; horizon: number; bottom: number; glow: number; fog: number;
  floor: number; edge: number; block: number; blockEdge: number;
  accent: number; gem: number; trail: number; planetA: number; planetB: number;
  css: string; css2: string;
}

export const PALETTES: Palette[] = [
  { // Cyan Drift
    top: 0x1a0c5e, horizon: 0xb42bd8, bottom: 0x0a0a3c, glow: 0xff5fe0, fog: 0x6a22b8,
    floor: 0x1c2f9c, edge: 0x2ef2ff, block: 0xff2a6e, blockEdge: 0xff6a9c,
    accent: 0xffe53a, gem: 0xffe53a, trail: 0x2ef2ff, planetA: 0xffb03a, planetB: 0xff2a9a,
    css: '#2ef2ff', css2: '#ff5fe0',
  },
  { // Solar Flare
    top: 0x4a0c58, horizon: 0xff5a2a, bottom: 0x300628, glow: 0xffc23a, fog: 0xc23a3a,
    floor: 0x7a1c4a, edge: 0xffc02e, block: 0x18d8ff, blockEdge: 0x8af4ff,
    accent: 0xff3ad0, gem: 0x7dffea, trail: 0xff8a2e, planetA: 0xfff27a, planetB: 0xff3a6a,
    css: '#ffc02e', css2: '#ff3ad0',
  },
  { // Toxic Pulse
    top: 0x06204a, horizon: 0x12b884, bottom: 0x031c22, glow: 0x7dff5a, fog: 0x0e7a6a,
    floor: 0x0e5a46, edge: 0x9dff3a, block: 0xff3df2, blockEdge: 0xff9afa,
    accent: 0x3af0ff, gem: 0x3af0ff, trail: 0x9dff3a, planetA: 0xc86aff, planetB: 0x4a22c0,
    css: '#9dff3a', css2: '#3af0ff',
  },
  { // Frost Line
    top: 0x0a1660, horizon: 0x2f86e8, bottom: 0x081244, glow: 0x7ac8ff, fog: 0x2c66c8,
    floor: 0x16307e, edge: 0x7fdcff, block: 0xff5a1f, blockEdge: 0xffa66a,
    accent: 0x7dffb4, gem: 0xfff27a, trail: 0x8fdcff, planetA: 0xa8d8ff, planetB: 0x3a5ae0,
    css: '#bfeaff', css2: '#7dffb4',
  },
  { // Gravity Well
    top: 0x2c0a72, horizon: 0xff2a6e, bottom: 0x14002e, glow: 0xff9a3a, fog: 0xa81a72,
    floor: 0x4a1a90, edge: 0xff4fd8, block: 0x2affd0, blockEdge: 0xa4ffec,
    accent: 0xffe53a, gem: 0xffffff, trail: 0xff7ae6, planetA: 0xff6a2a, planetB: 0x7a0aa0,
    css: '#ff4fd8', css2: '#ffe53a',
  },
];
