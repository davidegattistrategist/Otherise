/** Foto di un check come la vede la pagina (link temporanei). */
export type CheckPhoto = {
  id: string;
  checkId: string;
  checkDate: string | null;
  url: string | null;
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
  createdAt: string;
};

/** Al massimo tante foto per volta (un check ne ha di solito 4–6). */
export const MAX_PHOTOS_PER_UPLOAD = 20;
/**
 * Lato lungo della foto salvata: nitida su telefono e computer (lo schermo di un
 * telefono è largo poco più di 1000 pixel). Il telefono la ricomprime con
 * mozjpeg (lo stesso JPEG, ma più furbo): a tutto schermo è uguale, si nota
 * appena solo ingrandendo molto, e pesa circa 150–190 KB invece di 250–300
 * (deciso dal titolare, per stare a lungo nel piano gratuito di Supabase).
 * Se mozjpeg non parte, si usa il JPEG del browser a PHOTO_QUALITY.
 */
export const PHOTO_LONG_SIDE = 1600;
export const PHOTO_QUALITY = 0.82;
/** Qualità mozjpeg (0–100) della foto e della miniatura. */
export const MOZ_QUALITY = 72;
export const MOZ_THUMB_QUALITY = 65;
/** Miniatura per le griglie (si carica in un attimo). */
export const THUMB_LONG_SIDE = 480;

/**
 * Foto caricata in modalità check ma non ancora registrata: il file è già
 * nello spazio file (`<cliente>/<check>/…`), la riga in check_photos si scrive
 * con "Check finito". Sta nella bozza del check, così la vede anche l'altro
 * dispositivo.
 */
export type PendingPhoto = { path: string; thumbPath: string; width: number; height: number; size: number };
