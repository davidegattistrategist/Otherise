/** Id del video YouTube da un link (watch, youtu.be, shorts), o null. */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m =
    /youtu\.be\/([\w-]{11})/.exec(url) ??
    /youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)([\w-]{11})/.exec(url);
  return m ? m[1] : null;
}

export function youtubeThumb(url: string | null | undefined): string | null {
  const id = youtubeId(url);
  return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null;
}
