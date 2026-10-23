/**
 * Pagina di avvio dell'app: il service worker (public/sw.js) la tiene da parte
 * e la mostra subito quando si apre l'app su "/", senza aspettare la rete.
 * Disegna il logo con il glitch (stesso markup dello splash del layout) e
 * intanto carica l'app vera ("/?app=1": il service worker la lascia passare).
 * Il browser tiene sullo schermo questa pagina finché la nuova non si
 * disegna, così mentre il server si sveglia si vede il logo e non lo
 * schermo vuoto.
 */
import { SPLASH_CSS, SPLASH_GO_KEY, SPLASH_INNER } from "@/lib/splash-markup";

export const dynamic = "force-static";

const GO = `try{sessionStorage.setItem(${JSON.stringify(SPLASH_GO_KEY)},String(Date.now()))}catch(e){}location.replace("/?app=1")`;

const HTML = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#ece6dc"><title>Otherise</title><style>html,body{margin:0;background:#ece6dc;color-scheme:light}${SPLASH_CSS}</style></head><body><div data-splash="" role="status" aria-label="Otherise, sto caricando">${SPLASH_INNER}</div><script>${GO}</script></body></html>`;

export function GET() {
  return new Response(HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
}
