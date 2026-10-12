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
/** Lato lungo della foto salvata: alta qualità ma senza i 12–48 megapixel dell'originale. */
export const PHOTO_LONG_SIDE = 2560;
export const PHOTO_QUALITY = 0.88;
/** Miniatura per le griglie (si carica in un attimo). */
export const THUMB_LONG_SIDE = 480;
