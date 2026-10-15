/**
 * Inquadratura di una foto dentro un riquadro fisso (confronto foto dei check):
 * di partenza la foto è intera e centrata; si ingrandisce/rimpicciolisce e si
 * sposta un po'. Gli stessi conti servono per mostrarla e per scaricare il
 * confronto esattamente come lo vedi.
 */
export type PhotoView = { s: number; x: number; y: number };

export const START_VIEW: PhotoView = { s: 1, x: 0, y: 0 };
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4;

export const isStartView = (v: PhotoView) => v.s === 1 && v.x === 0 && v.y === 0;

/** Dove sta la foto nel riquadro (coordinate del riquadro, in pixel). */
export function photoRect(nw: number, nh: number, fw: number, fh: number, v: PhotoView) {
  const base = Math.min(fw / nw, fh / nh);
  const w = nw * base * v.s;
  const h = nh * base * v.s;
  return { left: fw / 2 + v.x - w / 2, top: fh / 2 + v.y - h / 2, w, h };
}

/** Lo spostamento resta "leggero": la foto non può uscire dal riquadro. */
export function clampView(v: PhotoView, nw: number, nh: number, fw: number, fh: number): PhotoView {
  const s = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.s));
  const { w, h } = photoRect(nw, nh, fw, fh, { ...v, s });
  const maxX = Math.max(0, (w - fw) / 2) + fw * 0.25;
  const maxY = Math.max(0, (h - fh) / 2) + fh * 0.25;
  return { s, x: Math.min(maxX, Math.max(-maxX, v.x)), y: Math.min(maxY, Math.max(-maxY, v.y)) };
}

/** Ingrandisce di `factor` tenendo fermo il punto (px, py) misurato dal centro del riquadro. */
export function zoomAt(v: PhotoView, factor: number, px: number, py: number): PhotoView {
  const s = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.s * factor));
  const f = s / v.s;
  return { s, x: px - (px - v.x) * f, y: py - (py - v.y) * f };
}

/**
 * Misure di un riquadro: due foto affiancate (più la riga in mezzo) che stanno
 * nello spazio libero `aw`×`ah`, con il rapporto larghezza/altezza `aspect`.
 */
export function frameSize(aw: number, ah: number, aspect: number, divider = 2) {
  const byHeight = { fw: ah * aspect, fh: ah };
  if (byHeight.fw * 2 + divider <= aw) return { fw: Math.floor(byHeight.fw), fh: Math.floor(byHeight.fh) };
  const fw = (aw - divider) / 2;
  return { fw: Math.floor(fw), fh: Math.floor(fw / aspect) };
}
