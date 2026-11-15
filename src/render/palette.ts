/** One palette per world. Obstacles (block) always contrast with floor/edge and decor never uses the block hue. */
export interface Palette {
  top: number; horizon: number; bottom: number; glow: number; fog: number;
  floor: number; edge: number; block: number; blockEdge: number;
  accent: number; gem: number; /** Unused since the ship owns its trail colour; kept for world-coloured effects later. */ trail: number; planetA: number; planetB: number;
  css: string; css2: string;
  /** Optional style switches, used by worlds drawn after the concept art. */
  look?: Look;
}

export interface Look {
  /** Blocks are crates: dark faces with a glowing frame and a diamond emblem instead of stripes. */
  crate?: boolean;
  /** Gems are gold rings instead of diamonds. */
  rings?: boolean;
  /** Floating islands, far spires and pink cloud banks instead of a city of pillars; spiked suns and ring portals beside the road. */
  islands?: boolean;
  /** A big striped sunset sun on the horizon behind the road, the planet moves up to the right. */
  sunset?: boolean;
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
  { // Ember Rush: crimson world, lime obstacles
    top: 0x2a0410, horizon: 0xe01a36, bottom: 0x16020a, glow: 0xff7a4a, fog: 0x9a1428,
    floor: 0x5a0c1c, edge: 0xff4438, block: 0xb6ff2a, blockEdge: 0xe2ff9a,
    accent: 0xffe9a0, gem: 0x7dffea, trail: 0xff4438, planetA: 0xffd27a, planetB: 0xc81a1a,
    css: '#ff5a4a', css2: '#ffe9a0',
  },
  { // Volt Storm: navy night, electric yellow road, magenta obstacles
    top: 0x040a30, horizon: 0x1c50b8, bottom: 0x02061c, glow: 0xfff08a, fog: 0x163a8a,
    floor: 0x14245a, edge: 0xffe81a, block: 0xff3ad0, blockEdge: 0xff9aea,
    accent: 0x3af0ff, gem: 0xffffff, trail: 0xffe81a, planetA: 0xfff6b0, planetB: 0x2a6ae0,
    css: '#ffe81a', css2: '#3af0ff',
  },
  { // Zero Point: black void, white road, red obstacles
    top: 0x07071a, horizon: 0x6a6aa8, bottom: 0x020208, glow: 0xdfe6ff, fog: 0x34345a,
    floor: 0x20203a, edge: 0xf2f6ff, block: 0xff2a2a, blockEdge: 0xff9a8a,
    accent: 0x3affd0, gem: 0xffe53a, trail: 0xf2f6ff, planetA: 0xffffff, planetB: 0x5a5a9a,
    css: '#f2f6ff', css2: '#3affd0',
  },
  { // Neon Horizon (extreme): the concept art. Navy road, cyan edges, magenta sky, sunset, pink crates and spikes, gold rings
    top: 0x1a0a5a, horizon: 0xd02ad8, bottom: 0x2a0a52, glow: 0xff4fd8, fog: 0x7a2ac8,
    floor: 0x161c5a, edge: 0x2ee8ff, block: 0xff2a7a, blockEdge: 0xff7ab4,
    accent: 0x3af6ff, gem: 0xffc21a, trail: 0xff3ad8, planetA: 0xd86aff, planetB: 0x5a1aa8,
    css: '#2ee8ff', css2: '#ff4fd8',
    look: { crate: true, rings: true, islands: true, sunset: true },
  },
];
