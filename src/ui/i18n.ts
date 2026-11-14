/** All player-facing text. Add a language by adding one more dictionary with the same keys. */
export type Lang = 'en' | 'fi';

const en = {
  tag: 'HOVER · JUMP · SURVIVE',
  soundOn: 'SOUND ON', soundOff: 'SOUND OFF', fullscreen: 'FULLSCREEN', switchLang: 'SUOMEKSI',
  landscape: 'Best played in landscape',
  paused: 'PAUSED', resume: 'RESUME', restart: 'RESTART', levels: 'LEVELS',
  complete: 'LEVEL COMPLETE', next: 'NEXT LEVEL', again: 'PLAY AGAIN',
  attempts: 'ATTEMPTS', gems: 'GEMS', attempt: 'ATTEMPT', world: 'WORLD',
  touchSteer: 'DRAG TO STEER', touchJump: 'TAP TO JUMP', keySteer: 'A / D = STEER', keyJump: 'SPACE = JUMP',
  noWebgl: 'Neonrush needs WebGL 2, which this browser or device did not provide.',
  'hint.collect': 'COLLECT THE GEMS', 'hint.jump': 'JUMP!', 'hint.steer': 'STEER SIDEWAYS',
  'hint.dodge': 'DODGE OR JUMP OVER', 'hint.narrow': 'NARROW ROAD', 'hint.opening': 'FIND THE OPENING',
  'hint.gemjump': 'JUMP FOR THE GEM', 'hint.pad': 'YELLOW PAD LAUNCHES YOU', 'hint.stay': 'STAY ON THE ROAD',
  'hint.ontop': 'JUMP ON TOP', 'hint.boost': 'SPEED BOOST!', 'hint.long': 'LONG JUMP!',
  'hint.weave': 'WEAVE THROUGH', 'hint.again': 'AND AGAIN!', 'hint.finish': 'FINISH!',
};

export type Key = keyof typeof en;

const fi: Record<Key, string> = {
  tag: 'LEIJU · HYPPÄÄ · SELVIYDY',
  soundOn: 'ÄÄNET PÄÄLLÄ', soundOff: 'ÄÄNET POIS', fullscreen: 'KOKO NÄYTTÖ', switchLang: 'IN ENGLISH',
  landscape: 'Parhaimmillaan vaakanäytöllä',
  paused: 'TAUKO', resume: 'JATKA', restart: 'ALOITA ALUSTA', levels: 'KENTÄT',
  complete: 'KENTTÄ LÄPÄISTY', next: 'SEURAAVA KENTTÄ', again: 'PELAA UUDELLEEN',
  attempts: 'YRITYKSIÄ', gems: 'TIMANTIT', attempt: 'YRITYS', world: 'MAAILMA',
  touchSteer: 'VEDÄ = OHJAUS', touchJump: 'NAPAUTA = HYPPY', keySteer: 'A / D = OHJAUS', keyJump: 'VÄLILYÖNTI = HYPPY',
  noWebgl: 'Neonrush tarvitsee WebGL 2:n, jota tämä selain tai laite ei tarjonnut.',
  'hint.collect': 'KERÄÄ TIMANTIT', 'hint.jump': 'HYPPÄÄ!', 'hint.steer': 'OHJAA SIVULLE',
  'hint.dodge': 'VÄISTÄ TAI HYPPÄÄ YLI', 'hint.narrow': 'KAPEA TIE', 'hint.opening': 'ETSI AUKKO',
  'hint.gemjump': 'HYPPÄÄ TIMANTTIIN', 'hint.pad': 'KELTAINEN ALUSTA HEITTÄÄ ILMAAN', 'hint.stay': 'PYSY TIELLÄ',
  'hint.ontop': 'HYPPÄÄ PÄÄLLE', 'hint.boost': 'VAUHTIA!', 'hint.long': 'PITKÄ HYPPY!',
  'hint.weave': 'PUJOTTELE', 'hint.again': 'JA UUDESTAAN!', 'hint.finish': 'MAALI!',
};

const DICTS: Record<Lang, Record<Key, string>> = { en, fi };

export function detectLang(): Lang {
  try { return (navigator.language || '').toLowerCase().startsWith('fi') ? 'fi' : 'en'; } catch { return 'en'; }
}

export function translate(lang: Lang, key: string): string {
  const d = DICTS[lang] as Record<string, string>;
  return d[key] ?? (en as Record<string, string>)[key] ?? key;
}
