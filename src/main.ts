import { Game } from './game/game';
import { View } from './render/view';
import { detectLang, translate } from './ui/i18n';

const canvas = document.getElementById('c') as HTMLCanvasElement;
try {
  const view = new View(canvas, document.getElementById('flash')!);
  const game = new Game(view, document.getElementById('touch')!);
  if (location.search.includes('debug')) (window as unknown as { __game: Game }).__game = game;
} catch (err) {
  const el = document.getElementById('fatal')!;
  el.hidden = false;
  el.textContent = translate(detectLang(), 'noWebgl') + ' (' + String(err) + ')';
}
