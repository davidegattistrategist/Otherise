/**
 * Voci "Dopo" del controllo generale (15/10): editor dal telefono, elimina
 * programma in due passi, test del check, impostazioni con indice, video
 * dentro l'app, logbook che compatta l'esercizio finito, collaboratore.
 */
import { expect, test, type Page } from "@playwright/test";

const PASS = "Password-di-prova-123";

async function login(page: Page, email: string) {
  page.on("dialog", (d) => void d.accept());
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASS);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.getByRole("button", { name: "Entra" }).click()]);
}

async function openClient(page: Page, name: string) {
  await page.goto("/staff/clienti");
  await page.waitForLoadState("networkidle");
  await page.locator('a[href^="/staff/clienti/"]', { hasText: name }).filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}/);
  return /\/staff\/clienti\/([0-9a-f-]{36})/.exec(page.url())![1];
}

test("editor: elimina programma con allenamenti registrati propone di archiviarlo; dal telefono tipo di blocco e copia settimana", async ({ page }, info) => {
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Esempio Giulia");
  await page.goto(`/staff/clienti/${id}/programma`);
  // la fase in corso (con gli allenamenti registrati), non una bozza copiata da lei
  await page.getByRole("link", { name: /Fase 2 · Volume/ }).filter({ hasText: "In corso" }).first().click();
  await page.waitForURL(/\/staff\/programmi\//);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Elimina programma…" }).click();
  const ask = page.getByRole("alert").filter({ hasText: "già registrato" });
  await expect(ask).toBeVisible();
  await expect(ask.getByRole("button", { name: "Elimina per sempre" })).toBeVisible();
  await expect(ask.getByRole("button", { name: "Archivia" })).toBeVisible();
  await ask.getByRole("button", { name: "Annulla" }).click();
  await expect(ask).toHaveCount(0);
  if (info.project.name === "telefono") {
    // il primo giorno aperto: impostazioni del blocco e copia della settimana anche dal telefono
    await page.getByRole("button", { name: /Gambe e spinta/ }).first().click().catch(() => undefined);
    await expect(page.getByText("Tipo, giri, minuti e nota del blocco").filter({ visible: true }).first()).toBeVisible();
    // si apre sulla prima settimana non ancora fatta (le fatte sono bloccate)
    await expect(page.getByRole("tab", { name: "Settimana 1 (fatta)" }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Copia la settimana [2-4] sulle successive vuote/ }).filter({ visible: true }).first()).toBeVisible();
  }
});

test("check: righe dei test a richiesta, massimale stimato anche senza RPE", async ({ page }) => {
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Esempio Giulia");
  await page.goto(`/staff/clienti/${id}/check/nuovo`);
  await page.waitForLoadState("networkidle");
  const box = page.locator("details", { hasText: "Test di forza, corsa, HYROX" }).filter({ visible: true }).first();
  if (!(await box.evaluate((e) => (e as HTMLDetailsElement).open))) await box.locator("summary").click();
  // le righe: quelle già scritte più una vuota; "Altro test" ne aggiunge
  const rows = page.locator('input[name$="_exercise"][name^="test_"]');
  const before = await rows.count();
  const last = before - 1;
  await page.locator(`input[name="test_${last}_exercise"]`).fill("Squat");
  await page.locator(`input[name="test_${last}_load"]`).fill("100");
  await page.locator(`input[name="test_${last}_reps"]`).fill("15");
  await expect(page.getByText("oltre 12 ripetizioni non si stima").filter({ visible: true })).toBeVisible();
  await page.locator(`input[name="test_${last}_reps"]`).fill("5");
  await expect(page.getByText(/1\d\d(,\d)? kg/).filter({ visible: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "+ Altro test" }).click();
  await expect(rows).toHaveCount(before + 1);
  // niente bozza lasciata per le altre prove (si salva da sola mentre scrivi)
  await page.waitForTimeout(1500);
  await page.evaluate(async (key) => {
    localStorage.clear();
    await fetch(`/api/bozze?key=${encodeURIComponent(key)}`, { method: "DELETE" });
  }, `check:${id}:nuovo`);
});

test("impostazioni con indice; notifiche dicono come arrivano le email", async ({ page }) => {
  await login(page, "titolare@prova.local");
  await page.goto("/staff/impostazioni");
  const nav = page.getByRole("navigation", { name: "Sezioni delle impostazioni" });
  await expect(nav.getByRole("link", { name: "Backup" })).toBeVisible();
  await nav.getByRole("link", { name: "Email" }).click();
  await expect(page).toHaveURL(/#email$/);
  await page.goto("/staff/notifiche");
  await expect(page.getByText(/per email solo se lo scegli in/).filter({ visible: true }).first()).toBeVisible();
});

test("il video dell'esercizio si apre dentro l'app", async ({ page }) => {
  await login(page, "giulia@prova.local");
  await page.goto("/cliente/programma");
  // il plank (con il video) è nel giorno 1: lo apro
  const card = page.getByRole("heading", { name: /Gambe e spinta/ }).locator("xpath=ancestor::*[.//details][1]");
  const details = card.locator("details");
  if (!(await details.getAttribute("open").then((v) => v !== null))) await details.locator("summary").click();
  const video = card.getByRole("button", { name: "Video" }).first();
  await expect(video).toBeVisible();
  await video.click();
  const dialog = page.getByRole("dialog", { name: /^Video:/ });
  await expect(dialog.locator("iframe")).toHaveAttribute("src", /youtube-nocookie\.com\/embed\//);
  await dialog.getByRole("button", { name: "Chiudi il video" }).click();
  await expect(dialog).toHaveCount(0);
});

test("logbook: l'esercizio finito si compatta in una riga, Modifica lo riapre", async ({ page }, info) => {
  test.skip(info.project.name !== "pc", "stessi dati: basta un progetto");
  await login(page, "giulia@prova.local");
  await page.goto("/cliente/programma?settimana=4");
  const card = page.getByRole("heading", { name: /Tirata e core/ }).locator("xpath=ancestor::*[.//a[contains(@href,'/cliente/sessione/')]][1]");
  await card.locator("a[href*='/cliente/sessione/']").click();
  await page.waitForURL(/\/cliente\/sessione\//);
  await page.waitForLoadState("networkidle");
  const item = page.locator("[data-item]").filter({ has: page.locator('input[aria-label^="Lat machine"]') }).first();
  const checks = item.getByRole("button", { name: "Segna la serie come fatta" });
  const n = await checks.count();
  test.skip(n === 0, "serie già spuntate");
  for (let i = 0; i < n; i++) {
    await checks.first().click();
    const skip = page.getByRole("timer").getByRole("button", { name: "Salta" });
    if (await skip.isVisible().catch(() => false)) await skip.click();
  }
  const compact = page.getByRole("button", { name: /^Lat machine.*: fatto,.*Tocca per modificare$/ });
  await expect(compact).toBeVisible();
  await compact.click();
  // pulisco: tolgo le spunte e i valori
  const done = item.getByRole("button", { name: "Serie fatta" });
  while (await done.count()) await done.first().click();
  for (const input of await item.locator('input[aria-label*="serie"]').all()) await input.fill("");
  await expect(page.getByText(/Salvato alle/)).toBeVisible({ timeout: 10_000 });
});

test("collaboratore: in Dati vede che il cliente è suo; in Sessioni PT il conteggio senza importi", async ({ page }) => {
  await login(page, "collaboratore@prova.local");
  const id = await openClient(page, "Prova Luca");
  await page.goto(`/staff/clienti/${id}/profilo`);
  await expect(page.getByText(/^Lo segui tu/)).toBeVisible();
  await page.goto(`/staff/clienti/${id}/sessioni`);
  await expect(page.getByText(/Sessioni PT: |Il conteggio delle sessioni pagate lo tiene il titolare/).first()).toBeVisible();
  await expect(page.getByText(/€/)).toHaveCount(0);
});

test("telefono: le pagine non scorrono di lato", async ({ page }, info) => {
  test.skip(info.project.name !== "telefono", "serve la larghezza del telefono");
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Esempio Giulia");
  const wide = async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  for (const p of [`/staff/clienti/${id}/check`, `/staff/clienti/${id}/pagamenti`, "/staff/pagamenti", "/staff/impostazioni"]) {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    expect(await wide(), p).toBeLessThanOrEqual(0);
  }
});

test("telefono: aprendo un giorno del programma gli altri si chiudono (cliente ed editor)", async ({ page }, info) => {
  test.skip(info.project.name !== "telefono", "solo sul telefono");
  await login(page, "giulia@prova.local");
  await page.goto("/cliente/programma");
  // due giorni chiusi (il prossimo parte aperto e dipende da cosa hanno fatto gli altri test)
  const closed = page.locator('details[data-day-group="giorni"]:not([open])');
  expect(await closed.count()).toBeGreaterThan(1);
  const a = page.locator('details[data-day-group="giorni"]').nth(await closed.nth(0).evaluate((el) => [...document.querySelectorAll('details[data-day-group="giorni"]')].indexOf(el as HTMLDetailsElement)));
  const b = page.locator('details[data-day-group="giorni"]').nth(await closed.nth(1).evaluate((el) => [...document.querySelectorAll('details[data-day-group="giorni"]')].indexOf(el as HTMLDetailsElement)));
  await a.locator("summary").click();
  await expect(a).toHaveAttribute("open", "");
  await b.locator("summary").click();
  await expect(b).toHaveAttribute("open", "");
  await expect(a).not.toHaveAttribute("open", "");
  await expect(page.locator('details[data-day-group="giorni"][open]')).toHaveCount(1);
});

test("telefono: nell'editor un giorno aperto alla volta", async ({ page }, info) => {
  test.skip(info.project.name !== "telefono", "solo sul telefono");
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Esempio Giulia");
  await page.goto(`/staff/clienti/${id}/programma`);
  await page.getByRole("link", { name: /Fase 2 · Volume/ }).filter({ hasText: "In corso" }).first().click();
  await page.waitForURL(/\/staff\/programmi\//);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Chiudi tutti" }).first().click().catch(() => undefined);
  const openers = page.locator("[data-day-card]").getByRole("button", { name: /^Apri / });
  await openers.nth(0).click();
  await openers.first().click();
  await expect(page.locator("[data-day-card]").getByRole("button", { name: /^Chiudi / })).toHaveCount(1);
});

test("telefono stretto (Android 360 px): niente esce dallo schermo nelle pagine del cliente", async ({ page }, info) => {
  test.skip(info.project.name !== "telefono", "serve la larghezza del telefono");
  await page.setViewportSize({ width: 360, height: 780 });
  await login(page, "giulia@prova.local");
  for (const p of ["/cliente", "/cliente/programma", "/cliente/programma?settimana=1", "/cliente/progressi", "/cliente/percorso"]) {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    // elementi che sporgono a destra (escluse le file che scorrono di proposito)
    const out = await page.evaluate(() => {
      const W = document.documentElement.clientWidth;
      const bad: string[] = [];
      document.querySelectorAll("body *").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || r.right <= W + 1) return;
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const o = getComputedStyle(a).overflowX;
          if (o === "auto" || o === "scroll" || o === "hidden") return;
        }
        bad.push(`${el.tagName} ${(el.textContent ?? "").slice(0, 30)}`);
      });
      return bad;
    });
    expect(out, p).toEqual([]);
  }
  // le settimane del programma vanno a capo: nessuna fila che scorre
  await page.goto("/cliente/programma");
  await expect(page.getByRole("navigation", { name: "Settimane" }).getByRole("link", { name: /\(ora\)/ })).toBeVisible();
});
