/**
 * Schermata di apertura: mentre arrivano i dati della prima pagina compare il
 * logo al centro con un glitch ogni mezzo secondo. Solo HTML e CSS (markup e
 * stile in src/lib/splash-markup.ts, gli stessi della pagina di avvio
 * `/apertura` del service worker), niente file da scaricare. È il `fallback`
 * del Suspense nel layout principale: si vede solo al primo caricamento (nei
 * cambi di pagina React tiene la pagina vecchia finché è pronta la nuova).
 */
import { SPLASH_CSS, SPLASH_GO_SCRIPT, SPLASH_INNER } from "@/lib/splash-markup";

export function Splash() {
  return (
    <>
      <style>{SPLASH_CSS}</style>
      <script dangerouslySetInnerHTML={{ __html: SPLASH_GO_SCRIPT }} />
      <div data-splash="" role="status" aria-label="Otherise, sto caricando" dangerouslySetInnerHTML={{ __html: SPLASH_INNER }} />
    </>
  );
}
