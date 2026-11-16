import { CUSTOM_PREFIX } from '../core/custom';
import type { Save } from './storage';

/**
 * What a player has earned, worked out from the save. Nothing here is stored twice: stars and coins
 * follow from the per-track records, so a save merged from another device cannot count anything double.
 *
 * Only official tracks give stars (and so coins). A track the player built gives none until it has been
 * promoted to official; otherwise an easy track of one's own would be worth as much as a hard official one.
 */
export const STARS_PER_TRACK = 3;
/** Coins for each star. Other sources (daily quests, a track promoted to official) come later. */
export const COINS_PER_STAR = 10;
/** Stars needed before a player is listed on the global board. Open: the value is a first guess. */
export const BOARD_MIN_STARS = 9;

export interface PlayerStats {
  stars: number; starMax: number;
  /** Official tracks finished, out of how many there are. */
  finished: number; tracks: number;
  /** Gems held on official tracks (the best run of each). */
  gems: number;
  /** Runs started, practice included, on official tracks and on the player's own. Test drives are not runs. */
  attempts: number; attemptsOfficial: number;
  coinsEarned: number; coins: number;
  /** Enough stars for the global board. */
  onBoard: boolean;
}

const count = (v: unknown, max = Infinity): number => (typeof v === 'number' && v > 0 ? Math.min(max, Math.floor(v)) : 0);

/** Coins a number of stars is worth. */
export const coinsFor = (stars: number): number => stars * COINS_PER_STAR;

export function playerStats(save: Save, officialIds: readonly string[]): PlayerStats {
  let stars = 0, finished = 0, gems = 0, attemptsOfficial = 0;
  for (const id of new Set(officialIds)) {
    stars += count(save.stars[id], STARS_PER_TRACK);
    if (save.done[id]) finished++;
    gems += count(save.gems[id]);
    attemptsOfficial += count(save.attempts[id]);
  }
  let attempts = attemptsOfficial;
  for (const [id, n] of Object.entries(save.attempts)) if (id.startsWith(CUSTOM_PREFIX)) attempts += count(n);
  const coinsEarned = coinsFor(stars);
  return {
    stars, starMax: officialIds.length * STARS_PER_TRACK, finished, tracks: officialIds.length, gems, attempts, attemptsOfficial,
    coinsEarned, coins: Math.max(0, coinsEarned - count(save.spent)), onBoard: stars >= BOARD_MIN_STARS,
  };
}
