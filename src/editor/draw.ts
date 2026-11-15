import type { Palette } from '../render/palette';

/** 2D drawings of the tiles for the level editor: the track seen from above, driving direction to the right. */

export const css = (hex: number): string => '#' + hex.toString(16).padStart(6, '0');

function diamond(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.beginPath();
  c.moveTo(x, y - r); c.lineTo(x + r * 0.8, y); c.lineTo(x, y + r); c.lineTo(x - r * 0.8, y);
  c.closePath();
}

function chevron(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  c.beginPath();
  c.moveTo(x - s * 0.5, y - s); c.lineTo(x + s * 0.5, y); c.lineTo(x - s * 0.5, y + s);
  c.stroke();
}

function floor(c: CanvasRenderingContext2D, pal: Palette, x: number, y: number, w: number, h: number, fill = css(pal.floor)): void {
  c.fillStyle = fill;
  c.fillRect(x, y, w, h);
  c.fillStyle = 'rgba(255,255,255,.07)';
  c.fillRect(x, y, w, Math.max(1, h * 0.08));
}

/**
 * One tile in the cell (x, y, w, h). The cell is drawn edge to edge; the caller leaves the gaps.
 * Colours come from the palette of the track's world, so the obstacle colour is the one seen in play.
 */
export function drawTile(c: CanvasRenderingContext2D, t: string, pal: Palette, x: number, y: number, w: number, h: number): void {
  const cx = x + w / 2, cy = y + h / 2, u = Math.min(w, h);
  c.lineJoin = 'round'; c.lineCap = 'round';
  switch (t) {
    case '=': floor(c, pal, x, y, w, h); break;
    case '.': break;
    case '#': {
      c.fillStyle = css(pal.block);
      c.fillRect(x, y, w, h);
      c.save();
      c.beginPath(); c.rect(x, y, w, h); c.clip();
      c.strokeStyle = 'rgba(0,0,0,.28)'; c.lineWidth = u * 0.16;
      for (let k = -h; k < w + h; k += u * 0.42) { c.beginPath(); c.moveTo(x + k, y + h); c.lineTo(x + k + h, y); c.stroke(); }
      c.restore();
      c.strokeStyle = css(pal.blockEdge); c.lineWidth = Math.max(1, u * 0.07);
      c.strokeRect(x + 1, y + 1, w - 2, h - 2);
      break;
    }
    case 'x': {
      floor(c, pal, x, y, w, h);
      c.fillStyle = css(pal.block); c.strokeStyle = css(pal.blockEdge); c.lineWidth = 1;
      const n = 2, s = u * 0.22;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const px = x + (w * (i + 0.5)) / n, py = y + (h * (j + 0.5)) / n;
        c.beginPath(); c.moveTo(px + s, py); c.lineTo(px - s * 0.7, py - s * 0.8); c.lineTo(px - s * 0.7, py + s * 0.8); c.closePath();
        c.fill(); c.stroke();
      }
      break;
    }
    case 'o': case 'O': case '*': case '+': {
      if (t === 'o' || t === 'O') floor(c, pal, x, y, w, h);
      const high = t === 'O' || t === '+';
      c.fillStyle = css(pal.gem);
      diamond(c, cx, cy, u * (high ? 0.2 : 0.27)); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = Math.max(1, u * 0.04);
      diamond(c, cx, cy, u * (high ? 0.2 : 0.27)); c.stroke();
      if (high) {
        // a ring: this gem hangs high (needs a jump, or sits on a pad arc)
        c.strokeStyle = css(pal.gem); c.lineWidth = Math.max(1, u * 0.06);
        c.setLineDash(t === '+' ? [u * 0.12, u * 0.1] : []);
        c.beginPath(); c.arc(cx, cy, u * 0.38, 0, Math.PI * 2); c.stroke();
        c.setLineDash([]);
      }
      break;
    }
    case '^': case '>': {
      floor(c, pal, x, y, w, h, t === '>' ? '#ffffff' : css(pal.accent));
      c.strokeStyle = t === '>' ? css(pal.accent) : 'rgba(10,10,60,.85)';
      c.lineWidth = Math.max(1.5, u * 0.11);
      if (t === '^') chevron(c, cx, cy, u * 0.26);
      else { chevron(c, cx - u * 0.16, cy, u * 0.24); chevron(c, cx + u * 0.16, cy, u * 0.24); }
      break;
    }
    case 'i': {
      floor(c, pal, x, y, w, h, '#bfeaff');
      c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = Math.max(1, u * 0.06);
      c.beginPath(); c.moveTo(x + w * 0.2, y + h * 0.7); c.lineTo(x + w * 0.5, y + h * 0.3); c.moveTo(x + w * 0.55, y + h * 0.75); c.lineTo(x + w * 0.8, y + h * 0.42); c.stroke();
      break;
    }
    case 'm': {
      floor(c, pal, x, y, w, h);
      // the road slides sideways: across the lanes, which is up and down here
      c.strokeStyle = css(pal.accent); c.lineWidth = Math.max(1.5, u * 0.09);
      const a = u * 0.28, b = u * 0.16;
      c.beginPath();
      c.moveTo(cx, cy - a); c.lineTo(cx, cy + a);
      c.moveTo(cx - b, cy - a + b); c.lineTo(cx, cy - a); c.lineTo(cx + b, cy - a + b);
      c.moveTo(cx - b, cy + a - b); c.lineTo(cx, cy + a); c.lineTo(cx + b, cy + a - b);
      c.stroke();
      break;
    }
    case '|': {
      c.fillStyle = css(pal.edge);
      c.fillRect(x, cy - h * 0.14, w, h * 0.28);
      c.fillStyle = 'rgba(255,255,255,.5)';
      c.fillRect(x, cy - h * 0.14, w, Math.max(1, h * 0.06));
      break;
    }
  }
}

/** A small picture of a figure (rows of tiles) for its button. */
export function drawRows(c: CanvasRenderingContext2D, rows: string[], pal: Palette, x: number, y: number, cell: number): void {
  rows.forEach((row, r) => [...row].forEach((t, l) => {
    const px = x + r * cell, py = y + l * cell;
    if (t === '.' || t === '*' || t === '+') { c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(px, py, cell - 1, cell - 1); }
    drawTile(c, t, pal, px, py, cell - 1, cell - 1);
  }));
}
