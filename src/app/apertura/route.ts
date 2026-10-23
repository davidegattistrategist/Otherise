/**
 * Pagina di avvio dell'app: il service worker (public/sw.js) la tiene da parte
 * e la mostra subito quando si apre una pagina dell'app (icona sulla Home,
 * app del computer, pagina ricaricata, notifica), senza aspettare la rete.
 * Disegna il logo con il glitch (stesso markup dello splash del layout) e
 * intanto carica la pagina vera allo stesso indirizzo: il service worker
 * quella volta la lascia passare. Il browser tiene sullo schermo questa
 * pagina finché la nuova non si disegna, così mentre il server si sveglia si
 * vede il logo e non lo schermo vuoto.
 */
import { SPLASH_CSS, SPLASH_GO_KEY, SPLASH_INNER } from "@/lib/splash-markup";

export const dynamic = "force-static";

// Va alla pagina vera allo stesso indirizzo. Se l'indirizzo ha un #, o se questa pagina
// è già comparsa per lo stesso indirizzo pochi secondi fa (il service worker si è
// riavviato in mezzo), si aggiunge "app=1": il service worker lascia sempre passare.
// Parte dopo che il logo è stato disegnato (doppio requestAnimationFrame), al massimo dopo 0,4 s.
const GO = `(function(){var K=${JSON.stringify(SPLASH_GO_KEY)},L="otherise:launch",h=location.href,u=h.split("#")[0],m=h.slice(u.length),n=Date.now(),t=u;
try{sessionStorage.setItem(K,String(n))}catch(e){}
try{var p=JSON.parse(sessionStorage.getItem(L)||"null");if(m||(p&&p.u===u&&n-p.t<4000))t=u+(u.indexOf("?")<0?"?":"&")+"app=1";sessionStorage.setItem(L,JSON.stringify({u:u,t:n}))}catch(e){if(m)t=u+(u.indexOf("?")<0?"?":"&")+"app=1"}
var done=0,go=function(){if(done)return;done=1;location.replace(t+m)};
// prima il logo deve essere sullo schermo: Safari non disegna una pagina che se ne va prima del primo disegno
if(window.requestAnimationFrame)requestAnimationFrame(function(){requestAnimationFrame(function(){setTimeout(go,30)})});else setTimeout(go,60);
setTimeout(go,400)})()`;

const HTML = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#ece6dc"><title>Otherise</title><style>html,body{margin:0;background:#ece6dc;color-scheme:light}${SPLASH_CSS}</style></head><body><div data-splash="" role="status" aria-label="Otherise, sto caricando">${SPLASH_INNER}</div><script>${GO}</script></body></html>`;

export function GET() {
  return new Response(HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
}
