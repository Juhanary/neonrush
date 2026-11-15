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
  flipOn: 'GRAVITY FLIP \u2013 TAP ON THE BEAT', flipOff: 'GRAVITY RESTORED', tap: 'TAP!',
  half: 'HALFWAY!', record: 'NEW BEST!', starRule: 'FINISH \u00B7 HALF THE GEMS \u00B7 ALL GEMS',
  noWebgl: 'Neonrush needs WebGL 2, which this browser or device did not provide.',
  'hint.collect': 'COLLECT THE GEMS', 'hint.jump': 'JUMP!', 'hint.steer': 'STEER SIDEWAYS',
  'hint.dodge': 'DODGE OR JUMP OVER', 'hint.narrow': 'NARROW ROAD', 'hint.opening': 'FIND THE OPENING',
  'hint.gemjump': 'JUMP FOR THE GEM', 'hint.pad': 'ARROW PAD LAUNCHES YOU', 'hint.stay': 'STAY ON THE ROAD',
  'hint.ontop': 'JUMP ON TOP', 'hint.boost': 'SPEED BOOST!', 'hint.long': 'JUMP AT THE EDGE!',
  'hint.ice': 'ICE \u2013 NO GRIP!', 'hint.moving': 'THE ROAD MOVES', 'hint.rail': 'RAILS \u2013 STAY CENTERED', 'hint.flip': 'GET READY\u2026',
  'hint.weave': 'WEAVE THROUGH', 'hint.again': 'AND AGAIN!', 'hint.finish': 'FINISH!',
  'hint.spikes': 'SPIKES! JUMP ON THE BEAT', extreme: 'EXTREME',
  'g.spike.t': 'SPIKES', 'g.spike.d': 'Red pyramids. Any touch destroys the ship and you cannot land on them: jump over, never more than two rows at once. They sit just before a beat line, so the jump is on the beat.',
  'hint.lanes': 'FOLLOW THE ROAD', 'hint.sidejump': 'JUMP SIDEWAYS!', 'hint.zigzag': 'ZIGZAG', 'hint.switch': 'SWITCH RAILS',
  practice: 'PRACTICE', practiceOn: 'PRACTICE: ON', practiceOff: 'PRACTICE: OFF', practiceDone: 'PRACTICE RUN COMPLETE',
  practiceNote: 'Practice runs restart from the last checkpoint. They do not count for stars or records.',
  practiceMenu: 'Practice mode is on: you restart from the last checkpoint, and it is saved for next time.',
  ready: 'READY', cpBack: 'PREVIOUS CHECKPOINT', cpStart: 'FROM THE START', playReal: 'PLAY FOR REAL',
  guide: 'GUIDE', back: 'BACK', guideTitle: 'HOW IT WORKS',
  'g.gem.t': 'GEMS', 'g.gem.d': 'Floating diamonds. Finishing gives 1 star, half the gems 2, every gem 3. Some hang high and need a jump or a jump pad.',
  'g.jump.t': 'JUMP & SIDE JUMP', 'g.jump.d': 'A jump carries you about three tiles forward. Steer in the air to land up to two lanes to the side. A ring on the road shows where you will land.',
  'g.block.t': 'BLOCKS', 'g.block.d': 'Striped blocks in the warning colour of the world. Hitting the front destroys the ship, the sides only stop you, and the top is safe to land and drive on.',
  'g.pad.t': 'JUMP PAD', 'g.pad.d': 'Slow arrows pointing ahead. Launches you high and far with no input. Always safe to ride straight.',
  'g.boost.t': 'BOOST PAD', 'g.boost.d': 'Fast bright arrows. A second of extra speed, so the next jump flies much further. Jump late, at the edge.',
  'g.ice.t': 'ICE', 'g.ice.d': 'Pale sparkling tiles. Steering has almost no grip: turn early and gently, the ship keeps sliding.',
  'g.move.t': 'MOVING ROAD', 'g.move.d': 'Tiles with sideways arrows slide left and right in a wave. Follow them or you drop through.',
  'g.rail.t': 'RAILS', 'g.rail.d': 'A narrow beam in the middle of a lane. Stay centred. You can slide across to a rail in the next lane without jumping.',
  'g.flip.t': 'GRAVITY FLIP', 'g.flip.d': 'Between two portals time slows and gravity pulls up. Each tap pushes the ship down: one tap per beat holds your height. Float over blocks, stay under the ceiling, and do not tap too much over a gap.',
  'g.beat.t': 'THE BEAT', 'g.beat.d': 'Three tiles are one beat. Dashed lines across the road mark the beats, solid lines the bars. Gaps start right after a line, so you jump on the beat. The music follows the ship, and gems, jumps and taps play in key.',
  'g.hype.t': 'HALFWAY & NEW BEST', 'g.hype.d': 'Passing 50 % and beating your record add music layers, speed lines and a rainbow road. Obstacles never change colour.',
  'g.prac.t': 'PRACTICE MODE', 'g.prac.d': 'Diamonds beside the road are checkpoints. You restart from the last one, it is saved per track, and the arrows in the corner step back or start over.',
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
  flipOn: 'PAINOVOIMA K\u00C4\u00C4NTYY \u2013 NAPAUTA TAHDISSA', flipOff: 'PAINOVOIMA PALASI', tap: 'NAPUTA!',
  half: 'PUOLIV\u00C4LI!', record: 'UUSI ENN\u00C4TYS!', starRule: 'MAALI \u00B7 PUOLET TIMANTEISTA \u00B7 KAIKKI TIMANTIT',
  noWebgl: 'Neonrush tarvitsee WebGL 2:n, jota tämä selain tai laite ei tarjonnut.',
  'hint.collect': 'KERÄÄ TIMANTIT', 'hint.jump': 'HYPPÄÄ!', 'hint.steer': 'OHJAA SIVULLE',
  'hint.dodge': 'VÄISTÄ TAI HYPPÄÄ YLI', 'hint.narrow': 'KAPEA TIE', 'hint.opening': 'ETSI AUKKO',
  'hint.gemjump': 'HYPPÄÄ TIMANTTIIN', 'hint.pad': 'NUOLIALUSTA HEITTÄÄ ILMAAN', 'hint.stay': 'PYSY TIELLÄ',
  'hint.ontop': 'HYPPÄÄ PÄÄLLE', 'hint.boost': 'VAUHTIA!', 'hint.long': 'HYPPÄÄ REUNALTA!',
  'hint.ice': 'J\u00C4\u00C4T\u00C4 \u2013 EI PITOA!', 'hint.moving': 'TIE LIIKKUU', 'hint.rail': 'KISKOT \u2013 PYSY KESKELL\u00C4', 'hint.flip': 'VALMISTAUDU\u2026',
  'hint.weave': 'PUJOTTELE', 'hint.again': 'JA UUDESTAAN!', 'hint.finish': 'MAALI!',
  'hint.spikes': 'PIIKIT! HYPPÄÄ TAHDISSA', extreme: 'ÄÄRIMMÄINEN',
  'g.spike.t': 'PIIKIT', 'g.spike.d': 'Punaiset pyramidit. Pienikin kosketus tuhoaa aluksen, eikä niiden päälle voi laskeutua: hyppää yli, korkeintaan kaksi riviä kerrallaan. Ne ovat juuri ennen iskuviivaa, joten hyppy osuu iskuun.',
  'hint.lanes': 'SEURAA TIETÄ', 'hint.sidejump': 'HYPPÄÄ SIVULLE!', 'hint.zigzag': 'SIKSAK', 'hint.switch': 'VAIHDA KISKOA',
  practice: 'HARJOITUS', practiceOn: 'HARJOITUS: PÄÄLLÄ', practiceOff: 'HARJOITUS: POIS', practiceDone: 'HARJOITUSAJO LÄPI',
  practiceNote: 'Harjoitusajo jatkuu viimeisestä välipisteestä. Se ei kerrytä tähtiä eikä ennätyksiä.',
  practiceMenu: 'Harjoitustila on päällä: jatkat viimeisestä välipisteestä, ja se tallentuu seuraavaa kertaa varten.',
  ready: 'VALMIINA', cpBack: 'EDELLINEN VÄLIPISTE', cpStart: 'ALUSTA ASTI', playReal: 'PELAA OIKEASTI',
  guide: 'OPAS', back: 'TAKAISIN', guideTitle: 'NÄIN SE TOIMII',
  'g.gem.t': 'TIMANTIT', 'g.gem.d': 'Leijuvia timantteja. Maalista saa 1 tähden, puolista timanteista 2 ja kaikista 3. Osa on korkealla ja vaatii hypyn tai hyppyalustan.',
  'g.jump.t': 'HYPPY JA SIVUHYPPY', 'g.jump.d': 'Hyppy kantaa noin kolme laattaa eteenpäin. Ohjaa ilmassa, niin laskeudut jopa kaksi kaistaa sivummalle. Rengas tiessä näyttää laskeutumiskohdan.',
  'g.block.t': 'ESTEET', 'g.block.d': 'Raidalliset palikat maailman varoitusvärissä. Etuosaan osuminen tuhoaa aluksen, kylki vain pysäyttää, ja päälle voi laskeutua ja ajaa.',
  'g.pad.t': 'HYPPYALUSTA', 'g.pad.d': 'Hitaat eteenpäin osoittavat nuolet. Heittää korkealle ja kauas ilman ohjausta. Suoraan ajamalla aina turvallinen.',
  'g.boost.t': 'VAUHTIALUSTA', 'g.boost.d': 'Nopeat kirkkaat nuolet. Sekunti lisävauhtia, joten seuraava hyppy kantaa paljon pidemmälle. Hyppää myöhään, aivan reunalta.',
  'g.ice.t': 'JÄÄ', 'g.ice.d': 'Vaaleat kimaltavat laatat. Ohjauksessa ei ole juuri pitoa: käänny ajoissa ja varovasti, alus jatkaa liukumista.',
  'g.move.t': 'LIIKKUVA TIE', 'g.move.d': 'Sivunuolilla merkityt laatat liukuvat aaltona vasemmalle ja oikealle. Seuraa niitä tai putoat läpi.',
  'g.rail.t': 'KISKOT', 'g.rail.d': 'Kapea palkki kaistan keskellä. Pysy keskellä. Viereisen kaistan kiskolle voi liukua hyppäämättä.',
  'g.flip.t': 'PAINOVOIMAN KÄÄNTÖ', 'g.flip.d': 'Kahden portaalin välissä aika hidastuu ja painovoima vetää ylös. Jokainen napautus painaa alusta alas: yksi napautus per isku pitää korkeuden. Leiju esteiden yli, pysy katon alla äläkä naputa liikaa aukon päällä.',
  'g.beat.t': 'TAHTI', 'g.beat.d': 'Kolme laattaa on yksi isku. Katkoviivat tien poikki merkitsevät iskut, yhtenäiset viivat tahdit. Aukot alkavat heti viivan jälkeen, joten hyppäät iskulla. Musiikki seuraa alusta, ja timantit, hypyt ja napautukset soivat sävellajissa.',
  'g.hype.t': 'PUOLIVÄLI JA ENNÄTYS', 'g.hype.d': 'Kun ylität 50 % tai oman ennätyksesi, musiikkiin tulee kerroksia ja ruutuun vauhtiviivat ja sateenkaaritie. Esteiden väri ei muutu koskaan.',
  'g.prac.t': 'HARJOITUSTILA', 'g.prac.d': 'Tien vieressä olevat timantit ovat välipisteitä. Jatkat viimeisestä, se tallentuu kenttäkohtaisesti, ja kulman nuolilla pääset taaksepäin tai alkuun.',
};

const DICTS: Record<Lang, Record<Key, string>> = { en, fi };

export function detectLang(): Lang {
  try { return (navigator.language || '').toLowerCase().startsWith('fi') ? 'fi' : 'en'; } catch { return 'en'; }
}

export function translate(lang: Lang, key: string): string {
  const d = DICTS[lang] as Record<string, string>;
  return d[key] ?? (en as Record<string, string>)[key] ?? key;
}
