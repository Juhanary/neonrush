import { chordRoot, noteOf, stepOf, type Kit, type Song } from './songs';

/**
 * Checks that a song is well formed: every pattern is one bar of legal characters, the form only names
 * phrases that exist, and the notes stay in a playable register. Returns one line per problem (empty =
 * fine). No audio here, so it runs in tests and in the level editor before a pasted song is accepted.
 */
export function checkSong(song: Song): string[] {
  const out: string[] = [];
  const pat = (what: string, p: unknown, legal: RegExp): p is string => {
    if (typeof p !== 'string' || p.length !== 16) { out.push(`${what}: must be 16 characters, got ${typeof p === 'string' ? p.length : typeof p}`); return false; }
    if (!legal.test(p)) { out.push(`${what}: illegal character in "${p}"`); return false; }
    return true;
  };
  const DRUM = /^[xXo.]+$/, NOTE = /^[1-9a-gA-G.\-]+$/;
  const notes = (what: string, p: unknown): p is string => {
    if (!pat(what, p, NOTE)) return false;
    for (let s = 0; s < 16; s++) if (p[s] === '-' && (s === 0 || p[s - 1] === '.')) { out.push(`${what}: "-" at step ${s + 1} holds nothing`); return false; }
    return true;
  };

  if (!Number.isInteger(song.key) || song.key < 48 || song.key > 76) out.push(`key: MIDI ${song.key} is outside 48..76`);
  if (!Array.isArray(song.scale) || song.scale.length !== 7 || song.scale[0] !== 0) out.push('scale: must be seven semitone offsets starting at 0');
  if (typeof song.chords !== 'string' || !/^[1-7]+$/.test(song.chords)) out.push(`chords: one digit 1..7 per bar, got "${song.chords}"`);
  if (out.length) return out; // the rest needs a usable key, scale and chord loop

  if (!Array.isArray(song.kit) || song.kit.length !== 3) out.push('kit: needs patterns for energy 1, 2 and 3');
  else song.kit.forEach((kit, e) => { for (const part of ['kick', 'snare', 'clap', 'hat', 'open', 'perc'] as (keyof Kit)[]) pat(`kit[${e + 1}].${part}`, kit?.[part], DRUM); });

  const bars = song.chords.length;
  if (!Array.isArray(song.bass?.pat) || song.bass.pat.length !== 3) out.push('bass.pat: needs patterns for energy 1, 2 and 3');
  else song.bass.pat.forEach((p, e) => {
    if (!notes(`bass.pat[${e + 1}]`, p)) return;
    for (let bar = 0; bar < bars; bar++) for (const ch of p) {
      const st = stepOf(ch);
      if (st === null) continue;
      const n = noteOf(song, chordRoot(song, bar) + st, song.bass.oct);
      if (n < 24 || n > 67) { out.push(`bass.pat[${e + 1}]: MIDI ${n} in bar ${bar + 1} is outside 24..67`); return; }
    }
  });
  notes('arp.pat', song.arp?.pat);
  if (song.stab !== undefined) pat('stab', song.stab, /^[x.]+$/);

  const phrases: [string, string[] | undefined][] = [['A', song.lead?.A], ['B', song.lead?.B], ['C', song.lead?.C]];
  for (const [name, phrase] of phrases) {
    if (phrase === undefined && name === 'C') continue;
    if (!Array.isArray(phrase) || phrase.length !== 4) { out.push(`lead.${name}: must be four bars`); continue; }
    phrase.forEach((p, bar) => {
      if (!notes(`lead.${name}[${bar + 1}]`, p)) return;
      for (const ch of p) {
        const st = stepOf(ch);
        if (st === null) continue;
        const n = noteOf(song, st, song.lead.oct);
        if (n < 55 || n > 96) { out.push(`lead.${name}[${bar + 1}]: MIDI ${n} is outside 55..96`); return; }
      }
    });
  }
  if (typeof song.form !== 'string' || !/^[ABC\-]+$/.test(song.form)) out.push(`form: only A, B, C and "-", got "${song.form}"`);
  else if (song.form.includes('C') && !song.lead?.C) out.push('form: uses C but lead.C is missing');
  if (song.bpm !== undefined && (song.bpm < 60 || song.bpm > 200)) out.push(`bpm: ${song.bpm} is outside 60..200`);
  return out;
}
