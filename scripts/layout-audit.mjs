/**
 * Controllo dell'impaginazione: apre tutte le pagine dell'app (staff e
 * cliente) a larghezza di telefono, tablet e computer e segnala:
 * - "fuori": testo, pulsanti o caselle che escono dallo schermo o dalla card
 *   che li taglia (con overflow nascosto non si vedono e non si può scorrere);
 * - "testo-esce": testo più largo della sua casella;
 * - "colonna": parole impilate una per riga in una colonna troppo stretta;
 * - "casella": casella di testo che non mostra tutto quello che c'è scritto;
 * - "tagliato": testo tagliato con i puntini o dopo N righe. Dove è voluto
 *   (anteprime, riassunti di un giorno chiuso) l'elemento ha `data-clamp-ok`.
 * Le zone che scorrono di lato apposta (settimane, tabelle) non contano.
 *
 * Uso (server avviato, dati di prova; meglio con scripts/stress-demo.ts prima):
 *   node scripts/layout-audit.mjs [http://localhost:3000] > audit.json
 * Esce con codice 1 se trova problemi; l'elenco è anche su stderr.
 */
import { chromium } from "playwright";
import { auditPage } from "./layout-rules.mjs";

const BASE = process.argv[2] || "http://localhost:3000";
const PASS = "Password-di-prova-123";
const USERS = (process.env.AUDIT_USERS || "titolare,collaboratore,giulia,luca").split(",").map((u) => `${u}@prova.local`);
const ALL_VIEWPORTS = [
  { name: "telefono-360", width: 360, height: 780, mobile: true },
  { name: "iphone-390", width: 390, height: 844, mobile: true },
  { name: "tablet-820", width: 820, height: 1180, mobile: true },
  { name: "pc-1280", width: 1280, height: 800, mobile: false },
  { name: "pc-1600", width: 1600, height: 900, mobile: false },
];
// AUDIT_VIEWPORTS=telefono-360,pc-1280 per provarne solo alcune
const VIEWPORTS = process.env.AUDIT_VIEWPORTS ? ALL_VIEWPORTS.filter((v) => process.env.AUDIT_VIEWPORTS.split(",").includes(v.name)) : ALL_VIEWPORTS;
const MAX_PAGES = Number(process.env.AUDIT_MAX_PAGES || 70);
const SKIP = [/^\/login/, /^\/auth/, /^\/api\//, /^\/password-dimenticata/, /\/export/, /^\/privacy\/modulo/];

const templateOf = (u) => {
  const url = new URL(u, BASE);
  const p = url.pathname.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, ":id");
  const keys = [...url.searchParams.keys()].filter((k) => ["vista", "tutti", "periodo", "settimana"].includes(k)).sort();
  return p + (keys.length ? "?" + keys.join("&") : "");
};

async function auditUser(browser, email, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, deviceScaleFactor: vp.mobile ? 2 : 1, locale: "it-IT" });
  await ctx.addInitScript(() => {
    try {
      for (const [k, v] of [["otherise:install-guide", "done"], ["otherise:push-popup", "9999999999999"], ["otherise:quote-day", "off"], ["otherise:days-open", "all"], ["otherise:logbook-hint", "done"]]) localStorage.setItem(k, v);
    } catch {}
  });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  await page.goto(BASE + "/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASS);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }), page.click("button[type=submit]")]);
  const start = new URL(page.url()).pathname;
  const queue = [start];
  // ogni tipo di pagina al massimo tre volte (clienti e programmi diversi)
  const seen = new Map();
  const done = new Set();
  const found = [];
  let visited = 0;
  while (queue.length && visited < MAX_PAGES) {
    const href = queue.shift();
    const tpl = templateOf(href);
    if (done.has(href) || (seen.get(tpl) ?? 0) >= 3) continue;
    done.add(href);
    seen.set(tpl, (seen.get(tpl) ?? 0) + 1);
    try {
      await page.goto(BASE + href, { waitUntil: "networkidle", timeout: 30000 });
    } catch {
      continue;
    }
    if (new URL(page.url()).pathname.startsWith("/login")) break;
    visited += 1;
    // pagina normale, poi con ogni riquadro apribile aperto (uno alla volta)
    const record = (list, state) => {
      for (const i of list) found.push({ user: email, viewport: vp.name, page: tpl, state, ...i });
    };
    record(await page.evaluate(auditPage), "");
    const details = await page.locator("details:not([open])").count();
    for (let i = 0; i < Math.min(details, 12); i++) {
      await page.evaluate((n) => {
        const d = [...document.querySelectorAll("details:not([open])")][0];
        if (d) d.open = true;
        return n;
      }, i);
      await page.waitForTimeout(60);
      record(await page.evaluate(auditPage), "aperto");
    }
    const links = await page.evaluate(() => [...document.querySelectorAll("a[href^='/']")].map((a) => a.getAttribute("href")));
    // la modalità check non ha link: la si apre per il primo cliente visto
    if (email.startsWith("titolare")) {
      const cid = links.map((l) => /^\/staff\/clienti\/([0-9a-f-]{36})/.exec(l || "")?.[1]).find(Boolean);
      if (cid && !seen.has("/check/:id")) queue.push(`/check/${cid}`);
    }
    for (const l of links) {
      if (!l || SKIP.some((re) => re.test(l))) continue;
      if (!done.has(l) && (seen.get(templateOf(l)) ?? 0) < 3) queue.push(l);
    }
  }
  await ctx.close();
  return { visited, found };
}

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const all = [];
for (const vp of VIEWPORTS) {
  for (const email of USERS) {
    const { visited, found } = await auditUser(browser, email, vp);
    console.error(`${vp.name} ${email}: ${visited} pagine, ${found.length} segnalazioni`);
    all.push(...found);
  }
}
await browser.close();
// una riga per problema (stessa pagina, tipo e posizione), con dove capita
const key = (i) => `${i.type}|${i.page}|${i.where}|${i.what}`;
const grouped = new Map();
for (const i of all) {
  const g = grouped.get(key(i)) ?? { ...i, viewports: new Set(), users: new Set() };
  g.viewports.add(i.viewport);
  g.users.add(i.user.split("@")[0]);
  g.px = Math.max(g.px, i.px);
  grouped.set(key(i), g);
}
const rows = [...grouped.values()].map((g) => ({ type: g.type, page: g.page, what: g.what, where: g.where, px: g.px, viewports: [...g.viewports].join(","), users: [...g.users].join(",") }));
console.log(JSON.stringify(rows, null, 1));
for (const r of rows) console.error(`${r.type.padEnd(10)} ${r.page.padEnd(40)} ${r.viewports.padEnd(28)} ${r.px}px  ${r.what}  ‹${r.where}›`);
process.exit(rows.length ? 1 : 0);
