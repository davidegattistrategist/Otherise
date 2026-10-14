/**
 * Testo di un messaggio con gli indirizzi web cliccabili (si aprono in una
 * nuova scheda). Riconosce http(s)://… e www.…; la punteggiatura finale
 * (punto, virgola, parentesi chiusa…) resta fuori dal link.
 */
import { Fragment } from "react";

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;
const TRAILING = /[.,;:!?)\]'"»]+$/;

export function splitLinks(text: string): Array<{ text: string; href?: string }> {
  const out: Array<{ text: string; href?: string }> = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0];
    const tail = url.match(TRAILING)?.[0] ?? "";
    // una parentesi chiusa fa parte del link se ce n'è una aperta dentro (es. Wikipedia)
    const keep = tail.startsWith(")") && url.includes("(") ? 1 : 0;
    const cut = tail.length - keep;
    if (cut > 0) url = url.slice(0, -cut);
    const start = m.index ?? 0;
    if (start > last) out.push({ text: text.slice(last, start) });
    out.push({ text: url, href: url.toLowerCase().startsWith("www.") ? `https://${url}` : url });
    last = start + url.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export function Linkified({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((p, i) =>
        p.href ? (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="break-all underline underline-offset-2">
            {p.text}
          </a>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}
