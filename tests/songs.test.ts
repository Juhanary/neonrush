import { describe, expect, it } from 'vitest';
import { MOODS, describeSong, genName, generateSong, registerSong, songByName } from '../src/audio/generate';
import { checkSong } from '../src/audio/lint';
import { SONGS, chordRoot, noteOf, stepOf, type Song } from '../src/audio/songs';
import { LEVELS } from '../src/core/levels';

/** Which sixteenths of a bar start a note. */
const rhythm = (bar: string): string => bar.replace(/[^.\-]/g, 'x');

describe('songs', () => {
  it('every built-in song is well formed', () => {
    for (const [name, song] of Object.entries(SONGS)) expect(checkSong(song), name).toEqual([]);
  });

  it('every track names a song that exists, and no two tracks share one', () => {
    const used = LEVELS.map((l) => l.song);
    for (const name of used) expect(songByName(name), name).toBeDefined();
    expect(new Set(used).size).toBe(used.length);
  });

  it('track songs differ from each other in key, chords, kit and voices', () => {
    const sig = LEVELS.map((l) => { const s = SONGS[l.song]; return [s.key, s.scale.join(), s.chords, s.bass.kind, s.lead.kind, s.kit[2].kick + s.kit[2].snare].join('|'); });
    expect(new Set(sig).size).toBe(sig.length);
  });

  it('the checker catches broken songs', () => {
    const bad = (change: (s: Song) => void): string[] => { const s = structuredClone(SONGS.drift); change(s); return checkSong(s); };
    expect(bad((s) => { s.lead.A[0] = '5..3..1.5...3.2'; })[0]).toMatch(/lead\.A\[1\].*16 characters/);
    expect(bad((s) => { s.lead.B[2] = 'h---------------'; })[0]).toMatch(/illegal character/);
    expect(bad((s) => { s.bass.pat[1] = '-...1...1...1...'; })[0]).toMatch(/holds nothing/);
    expect(bad((s) => { s.chords = '1x43'; })[0]).toMatch(/chords/);
    expect(bad((s) => { s.lead.oct = 3; })[0]).toMatch(/outside 55\.\.96/);
    expect(bad((s) => { delete s.lead.C; })[0]).toMatch(/uses C/);
    expect(bad((s) => { s.kit[0].kick = 'x...x...q...x...'; })[0]).toMatch(/kit\[1\]\.kick/);
  });
});

describe('song generator', () => {
  const seeds = Array.from({ length: 300 }, (_, i) => i);

  it('is deterministic', () => {
    for (const seed of [0, 1, 4711, 'neon', 'my track']) for (const mood of MOODS) expect(generateSong(seed, { mood })).toEqual(generateSong(seed, { mood }));
    expect(generateSong(7)).not.toEqual(generateSong(8));
  });

  it('writes well-formed songs for every seed and mood', () => {
    for (const seed of seeds) for (const mood of MOODS) expect(checkSong(generateSong(seed, { mood })), `${seed} ${mood}`).toEqual([]);
  });

  it('keeps the lead between MIDI 60 and 88 and the bass tonic between G1 and D2', () => {
    for (const seed of seeds) {
      const s = generateSong(seed);
      for (const bar of [...s.lead.A, ...s.lead.B, ...s.lead.C!]) for (const ch of bar) {
        const st = stepOf(ch);
        if (st !== null) { const n = noteOf(s, st, s.lead.oct); expect(n >= 60 && n <= 88, `${seed}: ${bar} -> ${n}`).toBe(true); }
      }
      const tonic = noteOf(s, 0, s.bass.oct);
      expect(tonic >= 31 && tonic <= 38, `${seed}: bass tonic ${tonic}`).toBe(true);
    }
  });

  it('builds the hook the way docs/MUSIC.md asks', () => {
    for (const seed of seeds) {
      const s = generateSong(seed);
      for (const phrase of [s.lead.A, s.lead.B]) {
        // one rhythmic cell in bars 1 to 3, a different fourth bar
        expect(rhythm(phrase[1]), `${seed}`).toBe(rhythm(phrase[0]));
        expect(rhythm(phrase[2]), `${seed}`).toBe(rhythm(phrase[0]));
        // a chord tone wherever a note starts on beat 1 or 3
        phrase.forEach((bar, b) => {
          const root = chordRoot(s, b);
          for (const at of [0, 8]) {
            const st = stepOf(bar[at]);
            if (st !== null) expect([0, 2, 4], `${seed}: ${bar} step ${at}`).toContain((((st - root) % 7) + 7) % 7);
          }
        });
      }
      // bar 1 starts with a note: the player hears it after every crash
      expect(stepOf(s.lead.A[0][0]), `${seed}`).not.toBeNull();
      // A and B contrast: one is the long-note phrase, the other is not
      expect(s.lead.A[0].includes('-')).not.toBe(s.lead.B[0].includes('-'));
    }
  });

  it('gives varied results', () => {
    const songs = seeds.map((seed) => generateSong(seed));
    expect(new Set(songs.map((s) => s.lead.A.join())).size).toBeGreaterThan(250);
    expect(new Set(songs.map((s) => s.key)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(songs.map((s) => s.lead.kind)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(songs.map((s) => s.bass.kind)).size).toBeGreaterThanOrEqual(7);
  });

  it('resolves names: built in, generated, registered', () => {
    expect(songByName('drift')).toBe(SONGS.drift);
    expect(genName(4711, 'chase')).toBe('gen:4711:chase');
    expect(songByName('gen:4711:chase')).toEqual(generateSong(4711, { mood: 'chase' }));
    expect(songByName('gen:4711')).toEqual(generateSong(4711));
    expect(songByName('gen:4711:chase')).toBe(songByName('gen:4711:chase'));
    expect(songByName('nothing')).toBeUndefined();
    expect(songByName('gen:1:polka')).toBeUndefined();

    const pasted = JSON.parse(JSON.stringify(generateSong('pasted'))) as Song;
    expect(registerSong('mine', pasted)).toEqual([]);
    expect(songByName('mine')).toBe(pasted);
    expect(registerSong('drift', pasted)[0]).toMatch(/taken/);
    expect(registerSong('broken', { ...pasted, chords: '' })[0]).toMatch(/chords/);
    expect(registerSong('junk', {} as Song).length).toBeGreaterThan(0);
    expect(songByName('broken')).toBeUndefined();
  });

  it('describes a song in one line', () => {
    expect(describeSong(SONGS.drift)).toBe('C# minor · 1643 · grit bass · hollow lead');
    expect(describeSong(SONGS.flare)).toBe('G harmonic minor · 1465 · fm bass · grit lead');
    expect(describeSong(SONGS.pulse)).toMatch(/^D# phrygian/);
    expect(describeSong(SONGS.line)).toMatch(/^B dorian/);
    expect(describeSong(SONGS.menu)).toMatch(/^A major/);
  });
});
