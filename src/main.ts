import { Game } from './game/game';
import { View } from './render/view';

const canvas = document.getElementById('c') as HTMLCanvasElement;
try {
  const view = new View(canvas, document.getElementById('flash')!);
  const game = new Game(view, document.getElementById('touch')!);
  if (location.search.includes('debug')) (window as unknown as { __game: Game }).__game = game;
} catch (err) {
  const el = document.getElementById('fatal')!;
  el.hidden = false;
  el.textContent = 'Neonrush needs WebGL 2, which this browser or device did not provide. (' + String(err) + ')';
}
