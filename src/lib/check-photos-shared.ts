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
 * telefono è largo poco più di 1000 pixel) e leggera, circa 250–300 KB, per non
 * riempire lo spazio file del piano gratuito di Supabase (deciso dal titolare).
 */
export const PHOTO_LONG_SIDE = 1600;
export const PHOTO_QUALITY = 0.82;
/** Miniatura per le griglie (si carica in un attimo). */
export const THUMB_LONG_SIDE = 480;
