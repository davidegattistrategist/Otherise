/** Funzioni aggiunte dopo la prima versione: pagamenti rapidi, export, progressioni, registrazione per il cliente, AI sui diario. */
import { expect, test, type Page } from "@playwright/test";

const PASS = "Password-di-prova-123";
async function login(page: Page, email: string) {
  page.on("dialog", (d) => void d.accept());
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASS);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.getByRole("button", { name: "Entra" }).click()]);
}

test("promemoria di pagamento già scritto nella chat dell'app (niente WhatsApp)", async ({ page }) => {
  await login(page, "titolare@prova.local");
  await page.goto("/staff");
  await page.waitForLoadState("networkidle");
  const link = page.getByRole("link", { name: /^Promemoria in chat a / }).filter({ visible: true }).first();
  await expect(link).toBeVisible();
  await expect(page.locator('a[href*="wa.me"]')).toHaveCount(0);
  await link.click();
  await page.waitForURL(/\/staff\/messaggi\/[0-9a-f-]{36}$/);
  const box = page.locator("textarea").filter({ visible: true }).first();
  await expect(box).toHaveValue(/^Ciao .+! Ti ricordo che/);
});

test("cliente gratis: sparisce da pagamenti e previsioni, si può togliere", async ({ page }) => {
  await login(page, "titolare@prova.local");
  await page.goto("/staff/clienti");
  await page.locator('a[href^="/staff/clienti/"]', { hasText: "Demo Marta" }).filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}$/);
  const base = page.url();
  await page.goto(`${base}/pagamenti`);
  await page.locator("#sistema summary", { hasText: "Cliente gratis" }).click();
  await page.getByRole("button", { name: "Metti gratis" }).click();
  await expect(page.getByText("Non compare in pagamenti, scadenze, incassi, previsioni ed export")).toBeVisible();
  await expect(page.getByText("Gratis", { exact: true }).first()).toBeVisible();
  await page.goto("/staff/pagamenti");
  await expect(page.getByText("Incassi per mese")).toBeVisible();
  await expect(page.getByText("Demo Marta")).toHaveCount(0);
  await page.goto(`${base}/pagamenti`);
  await page.getByRole("button", { name: "Non è più gratis" }).click();
  await page.locator("#sistema summary", { hasText: "Cliente gratis" }).click();
  await expect(page.getByRole("button", { name: "Metti gratis" })).toBeVisible();
  await page.goto("/staff/pagamenti");
  await expect(page.getByText("Demo Marta").first()).toBeVisible();
});

test("i clienti sono in ordine alfabetico per cognome, con il cognome davanti", async ({ page }) => {
  await login(page, "titolare@prova.local");
  await page.goto("/staff/clienti");
  await page.waitForLoadState("networkidle");
  // nome e cognome di ogni cliente nell'elenco (telefono: elenco, computer: tabella)
  const names = await page.locator("main a.font-semibold, main a span.font-semibold").filter({ visible: true }).evaluateAll((els) =>
    els.filter((e) => /^\/staff\/clienti\/[0-9a-f-]{36}$/.test(e.closest("a")?.getAttribute("href") ?? "")).map((e) => (e as HTMLElement).innerText),
  );
  // negli elenchi si legge prima il cognome: "Esempio Giulia"
  const list = names.map((n) => n.trim());
  expect(list.length).toBeGreaterThan(2);
  expect(list).toContain("Esempio Giulia");
  expect(list).toEqual([...list].sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" })));
});

test("pausa: il cliente esce dai pagamenti da sistemare; fine percorso: al cliente resta solo la chat", async ({ page, browser }, info) => {
  await login(page, "titolare@prova.local");
  // pausa
  await page.goto("/staff/clienti");
  await page.locator('a[href^="/staff/clienti/"]', { hasText: "Demo Marta" }).filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}$/);
  const marta = page.url();
  await page.goto(`${marta}/profilo`);
  await page.getByRole("button", { name: "Metti in pausa" }).click();
  await expect(page.getByText("Cliente in pausa.")).toBeVisible();
  await page.goto("/staff/pagamenti");
  const fix = page.locator("section", { hasText: "Da sistemare" });
  if (await fix.count()) await expect(fix.getByText("Demo Marta")).toHaveCount(0);
  await expect(page.getByText("In pausa").filter({ visible: true }).first()).toBeVisible();
  // nell'elenco clienti sta nella sezione "In pausa", non tra gli attivi
  await page.goto("/staff/clienti");
  const pausa = page.getByRole("region", { name: "Clienti in pausa" });
  await expect(pausa.locator('a[href^="/staff/clienti/"]', { hasText: "Demo Marta" }).filter({ visible: true })).toHaveCount(1);
  await expect(page.locator('a[href^="/staff/clienti/"]', { hasText: "Demo Marta" }).filter({ visible: true })).toHaveCount(1);
  await page.goto(`${marta}/profilo`);
  await page.getByRole("button", { name: "Riattiva" }).click();
  await expect(page.getByText("Cliente di nuovo attivo.")).toBeVisible();

  // fine percorso
  await page.goto("/staff/clienti");
  await page.locator('a[href^="/staff/clienti/"]', { hasText: "Prova Luca" }).filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}$/);
  const luca = page.url();
  await page.goto(`${luca}/profilo`);
  await page.getByRole("button", { name: "Termina il percorso" }).click();
  await expect(page.getByText("Percorso terminato: al cliente resta solo la chat.")).toBeVisible();
  const client = await (await browser.newContext(info.project.use)).newPage();
  try {
    await login(client, "luca@prova.local");
    await client.goto("/cliente");
    await client.waitForURL(/\/cliente\/messaggi$/);
    await expect(client.getByText(/Il percorso è terminato/)).toBeVisible();
    await expect(client.getByRole("link", { name: "Programma" })).toHaveCount(0);
    await client.goto("/cliente/progressi");
    await client.waitForURL(/\/cliente\/messaggi$/);
    await client.goto("/cliente/profilo");
    await expect(client.getByRole("heading", { name: "Il tuo account" })).toBeVisible();
  } finally {
    await page.goto(`${luca}/profilo`);
    await page.getByRole("button", { name: "Riprendi il percorso" }).click();
    await expect(page.getByText("Cliente di nuovo attivo.")).toBeVisible();
  }
});

test("pagamenti: segna pagato in un tocco ed export CSV", async ({ page }) => {
  await login(page, "titolare@prova.local");
  await page.goto("/staff/pagamenti");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Incassi per mese")).toBeVisible();
  const box = page.locator("li", { hasText: /Test Sara|Esempio Giulia/ }).first();
  if (await box.getByRole("button", { name: "Pagato" }).count()) {
    await box.getByRole("button", { name: "Pagato" }).click();
    await expect(page.getByRole("status").filter({ hasText: /Registrato .*€/ }).first()).toBeVisible();
    // la riga può sparire dall'elenco (non c'è più niente da incassare), ma il messaggio
    // in basso ha "Modifica": lo elimina da lì, così i dati di prova restano com'erano
    await expect(page.getByRole("status").first()).not.toContainText("-1");
    await page.getByRole("status").getByRole("button", { name: /^Modifica: pagamento di / }).first().click();
    const dialog = page.getByRole("dialog", { name: /^Correggi il pagamento di / });
    await dialog.getByRole("button", { name: "Elimina il pagamento" }).click();
    await dialog.getByRole("button", { name: "Sì, elimina" }).click();
    await expect(dialog).toHaveCount(0);
  }
  const res = await page.request.get("/api/pagamenti/export?anno=2026");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  const csv = await res.text();
  expect(csv).toContain("Data;Cliente");
  expect(csv).toContain("Totale");
});

test("il collaboratore non può esportare i pagamenti", async ({ page }) => {
  await login(page, "collaboratore@prova.local");
  const res = await page.request.get("/api/pagamenti/export?anno=2026");
  expect(res.status()).toBe(403);
});

test("progressione automatica nell'editor", async ({ page }, info) => {
  test.skip(info.project.name !== "pc", "la griglia completa è per il computer");
  await login(page, "titolare@prova.local");
  await page.goto("/staff/modelli");
  await page.getByRole("button", { name: "Nuovo modello" }).click();
  await page.waitForURL(/\/staff\/programmi\//);
  await page.waitForLoadState("networkidle");
  await page.locator("table").first().waitFor();
  await page.getByRole("button", { name: "Esercizio", exact: true }).first().click();
  await page.getByLabel("Esercizio", { exact: true }).filter({ visible: true }).first().fill("Stacco");
  await page.getByLabel("Stacco, settimana 1").filter({ visible: true }).fill("4x6 80kg");
  await page.locator("table summary[aria-label^='Compila le settimane di Stacco']").click();
  await page.getByRole("button", { name: "+2,5 kg a settimana" }).first().click();
  await expect(page.getByLabel("Stacco, settimana 4").filter({ visible: true })).toHaveValue("4x6 87,5kg");
});

test("lo staff registra l'allenamento per il cliente e vede il riassunto AI", async ({ page }) => {
  await login(page, "titolare@prova.local");
  await page.goto("/staff/clienti");
  await page.locator('a[href^="/staff/clienti/"]', { hasText: "Esempio Giulia" }).filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}$/);
  const base = page.url();
  await page.getByRole("link", { name: "Registra l'allenamento" }).click();
  await page.waitForURL(/\/allenamento\//);
  await page.waitForLoadState("networkidle");
  // se il tocco arriva prima che la pagina sia pronta non succede nulla
  // (come sul telefono vero: si ritocca), quindi riprova finché salva
  const check = page.locator('button[aria-label="Segna la serie come fatta"]').filter({ visible: true });
  await expect(async () => {
    if (await check.count()) await check.first().click();
    else await page.locator("main input").filter({ visible: true }).first().fill(`Fatto in sessione ${Date.now()}`);
    await expect(page.getByText(/Salvato alle/)).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
  await page.goto(`${base}/diario`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Prepara il riassunto" }).click();
  await expect(page.getByText("Cosa funziona")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /Usala come risposta/ }).click();
  await expect(page.locator("textarea[name=coach_reply]").first()).toHaveValue(/Grazie per il diario/);
});

test("il cliente vede record ed esercizi nei progressi", async ({ page }) => {
  await login(page, "giulia@prova.local");
  await page.goto("/cliente/progressi");
  await expect(page.getByText("I tuoi esercizi")).toBeVisible();
  await expect(page.getByText("I tuoi record")).toBeVisible();
});

test("link per entrare preparato dal trainer: il cliente sceglie la password senza aspettare l'email", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "pc", "basta una volta");
  await login(page, "titolare@prova.local");
  await page.goto("/staff/clienti");
  await page.locator('a[href^="/staff/clienti/"]', { hasText: "Test Sara" }).filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}$/);
  await page.goto(`${page.url()}/profilo`);
  await page.getByRole("button", { name: "Prepara il link per entrare" }).click();
  const box = page.getByText(/Ecco il link per entrare nell'app/);
  await expect(box).toBeVisible();
  const link = /(https?:\/\/\S+)/.exec((await box.textContent()) ?? "")![1];
  const client = await (await browser.newContext(info.project.use)).newPage();
  await client.goto(link);
  // l'anteprima della pagina non consuma il link: serve il pulsante
  await expect(client.getByRole("heading", { name: "Benvenuto" })).toBeVisible();
  await client.getByRole("link", { name: "Entra e scegli la password" }).click();
  await client.waitForURL(/\/imposta-password/);
});

test("lezioni PT a parte: non spostano la scadenza del coaching; contatore, prezzo e saldo dalla scheda", async ({ page }) => {
  await login(page, "titolare@prova.local");
  await page.goto("/staff/clienti");
  await page.locator('a[href^="/staff/clienti/"]', { hasText: "Esempio Giulia" }).filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}$/);
  const base = new URL(page.url()).pathname;
  await page.goto(`${base}/pagamenti`);
  const status = page.getByText(/saldato fino al/).first();
  const before = await status.textContent();
  // un solo modo per registrare: Nuovo pagamento (già con lei scelta)
  await page.getByRole("link", { name: "Nuovo pagamento" }).first().click();
  await page.waitForURL(/\/staff\/pagamenti\/nuovo\?cliente=/);
  await page.getByRole("button", { name: /^Lezioni PT/ }).click();
  await page.getByRole("button", { name: "10 lezioni", exact: true }).click();
  await page.locator('input[name="amount"]').fill("700");
  // se c'è già il prezzo a lezione (giro precedente) la differenza non va sul credito
  const keep = page.getByTestId("credit-hint").getByRole("checkbox");
  if (await keep.isVisible().catch(() => false)) await keep.uncheck();
  await page.getByRole("button", { name: "Salva il pagamento" }).click();
  await expect(page.getByText("Pagamento registrato")).toBeVisible();
  await page.goto(`${base}/pagamenti`);
  await expect(status).toHaveText(before!);
  const row = page.locator("li", { hasText: "Pacchetto 10 lezioni PT" }).first();
  await expect(row).toContainText("Extra");
  await expect(row).toContainText("10 sessioni");
  // contatore delle sessioni PT: correzione da "Sistema i conti", scalano quando segni una sessione
  const card = page.locator("#sessioni-pt");
  const fix = page.locator("#sistema");
  const counter = fix.locator("details", { hasText: "Sessioni PT: correggi il conteggio" });
  await counter.locator("summary").click();
  await counter.locator("select[name=mode]").selectOption("left");
  await counter.locator("input[name=count]").fill("5");
  await counter.getByRole("button", { name: "Salva la correzione" }).click();
  await expect(page.getByText(/Fatto: 5 sessioni pagate ancora da fare/)).toBeVisible();
  await expect(card.getByText("sessioni rimaste (pagate, da fare)")).toBeVisible();
  await page.goto(`${base}/sessioni`);
  await expect(page.getByText("Sessioni PT: ne restano 5 pagate")).toBeVisible();
  await expect(page.getByText("Si scala dalle sessioni PT pagate").first()).toBeVisible();
  await page.getByRole("button", { name: "Salva la sessione" }).click();
  await expect(page.getByText("Sessione salvata.")).toBeVisible();
  await page.goto(`${base}/sessioni`);
  await expect(page.getByText("Sessioni PT: ne restano 4 pagate")).toBeVisible();
  // da saldare: 3 sessioni a 45 €
  await page.goto(`${base}/pagamenti`);
  await counter.locator("summary").click();
  await counter.locator("select[name=mode]").selectOption("due");
  await counter.locator("input[name=count]").fill("3");
  await counter.getByRole("button", { name: "Salva la correzione" }).click();
  await expect(page.getByText(/Fatto: 3 sessioni da saldare/)).toBeVisible();
  const price = fix.locator("details", { hasText: "Prezzo a lezione PT" });
  await price.locator("summary").click();
  await price.locator("input[name=price]").fill("45");
  await price.getByRole("button", { name: "Salva il prezzo" }).click();
  await expect(page.getByText(/Prezzo salvato: 45\s€ a sessione/)).toBeVisible();
  await expect(card.getByText(/sessioni da saldare · 135\s€/)).toBeVisible();
  // nella pagina Pagamenti, con Pagato e Promemoria
  await page.goto("/staff/pagamenti");
  const settle = page.locator("li", { hasText: "Esempio Giulia" }).filter({ hasText: /3 sessioni · 135\s€/ });
  await expect(settle).toBeVisible();
  await expect(settle.getByRole("link", { name: /Promemoria/ })).toBeVisible();
  await page.goto(`${base}/pagamenti`);
  await card.getByRole("link", { name: /Scrivi in chat quante sono/ }).click();
  await page.waitForURL(/\/staff\/messaggi\//);
  await expect(page.locator("textarea").filter({ visible: true }).first()).toHaveValue(/siamo a 3 sessioni da saldare \(3 sessioni × 45\s€ = 135\s€\)/);
  // saldo con Pagato da Pagamenti: torna in pari
  await page.goto("/staff/pagamenti");
  await page.locator("li", { hasText: "Esempio Giulia" }).filter({ hasText: /3 sessioni · 135\s€/ }).getByRole("button", { name: "Pagato" }).click();
  await expect(page.getByText(/Registrato 135/).first()).toBeVisible();
  await page.goto(`${base}/pagamenti`);
  await expect(card.getByText("In pari")).toBeVisible();
  await expect(page.locator("li", { hasText: "Saldo sessioni PT" }).first()).toContainText("3 sessioni");
});

test("pagamento già registrato: si corregge data d'incasso e periodo coperto", async ({ page }) => {
  await login(page, "titolare@prova.local");
  await page.goto("/staff/clienti");
  await page.locator('a[href^="/staff/clienti/"]', { hasText: "Esempio Giulia" }).filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}$/);
  await page.goto(`${page.url()}/pagamenti`);
  // il primo pagamento con un periodo: "Modifica" apre la finestra di correzione
  const item = page.locator("li").filter({ hasText: "copre" }).filter({ visible: true }).first();
  await item.getByRole("button", { name: /^Modifica/ }).click();
  const dlg = page.getByRole("dialog");
  const paid = dlg.locator('input[name="paid_on"]');
  const start = dlg.locator('input[name="period_start"]');
  const end = dlg.locator('input[name="period_end"]');
  const before = { paid: await paid.inputValue(), start: await start.inputValue(), end: await end.inputValue() };
  await paid.fill("2026-09-24");
  await start.fill("2026-09-01");
  await end.fill("2026-11-30");
  await dlg.getByRole("button", { name: "Salva le modifiche" }).click();
  await expect(dlg.getByText("Pagamento corretto.")).toBeVisible();
  await page.reload();
  await expect(page.locator("li").filter({ hasText: /copre 1 set.*30 nov/ }).filter({ visible: true }).first()).toBeVisible();

  // rimetto com'era
  const again = page.locator("li").filter({ hasText: /copre 1 set.*30 nov/ }).filter({ visible: true }).first();
  await again.getByRole("button", { name: /^Modifica/ }).click();
  const dlg2 = page.getByRole("dialog");
  await dlg2.locator('input[name="paid_on"]').fill(before.paid);
  await dlg2.locator('input[name="period_start"]').fill(before.start);
  await dlg2.locator('input[name="period_end"]').fill(before.end);
  await dlg2.getByRole("button", { name: "Salva le modifiche" }).click();
  await expect(dlg2.getByText("Pagamento corretto.")).toBeVisible();
});

test("cliente spot: basta il nome, sesso e durata delle fasi si decidono dopo", async ({ page }, info) => {
  await login(page, "titolare@prova.local");
  await page.goto("/staff/clienti/nuovo");
  const name = `Spot${info.project.name}${Date.now() % 10000}`;
  await page.fill("input[name=first_name]", name);
  await expect(page.locator("select[name=sex]")).toHaveValue("");
  await expect(page.locator("select[name=phase_weeks]")).toHaveValue("");
  await page.getByRole("button", { name: "Crea cliente" }).click();
  await page.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}$/);
  const base = page.url();
  // per il check serve il sesso: lo chiede e poi mostra le pliche giuste
  await page.goto(`${base}/check/nuovo`);
  await page.getByRole("button", { name: "Donna" }).click();
  await expect(page.locator("input[name=sf_coscia_0]")).toBeVisible();
  await expect(page.locator("input[name=sf_pettorale_0]")).toHaveCount(0);
});

test("nuovo pagamento da Pagamenti: cliente nuovo con abbonamento, poi rinnovo e un pagamento libero; storico completo", async ({ page }, info) => {
  await login(page, "titolare@prova.local");
  const name = `Pagatore${info.project.name}${Date.now() % 10000}`;
  await page.goto("/staff/pagamenti");
  await page.getByRole("link", { name: "Nuovo pagamento" }).click();
  await page.waitForURL(/\/staff\/pagamenti\/nuovo/);

  // cliente nuovo al volo + abbonamento trimestrale
  await page.locator("#pay-search").fill(name);
  await page.getByRole("button", { name: /Cliente nuovo/ }).click();
  await expect(page.locator('input[name="new_first_name"]')).toHaveValue(name);
  await page.getByRole("button", { name: /^Coaching/ }).click();
  await page.getByRole("button", { name: "Trimestrale", exact: true }).click();
  await page.locator('input[name="amount"]').fill("300");
  await page.locator('select[name="method"]').selectOption("cash");
  await page.locator('input[name="period_start"]').fill("2026-09-01");
  await expect(page.locator('input[name="period_end"]')).toHaveValue("2026-11-30");
  await expect(page.getByTestId("payment-summary")).toContainText("vale dal 1 settembre 2026 al 30 novembre 2026");
  await page.getByRole("button", { name: "Salva il pagamento" }).click();
  await expect(page.getByText("Pagamento registrato")).toBeVisible();
  await expect(page.getByText(/a posto fino al 30 novembre 2026/)).toBeVisible();

  // secondo pagamento: rinnovo proposto in automatico dal giorno dopo
  await page.getByRole("button", { name: "Registra un altro pagamento" }).click();
  await page.locator("#pay-search").fill(name);
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page.getByRole("button", { name: /Rinnovo/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('input[name="period_start"]')).toHaveValue("2026-12-01");
  await expect(page.locator('input[name="amount"]')).toHaveValue("300");
  await page.getByRole("button", { name: "Salva il pagamento" }).click();
  await expect(page.getByText(/a posto fino al 28 febbraio 2027/)).toBeVisible();

  // pagamento libero
  await page.getByRole("button", { name: "Registra un altro pagamento" }).click();
  await page.locator("#pay-search").fill(name);
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await page.getByRole("button", { name: /^Altro valutazione/ }).click();
  await page.getByRole("button", { name: "Valutazione posturale", exact: true }).click();
  await page.locator('input[name="amount"]').fill("50");
  await expect(page.getByTestId("payment-summary")).toContainText("per: Valutazione posturale");
  await page.getByRole("button", { name: "Salva il pagamento" }).click();
  await expect(page.getByText("Pagamento registrato")).toBeVisible();

  // tutti i pagamenti, in ordine
  await page.goto("/staff/pagamenti");
  await page.locator("#tutti-i-pagamenti summary").click();
  await expect(page.locator("#tutti-i-pagamenti li").filter({ hasText: name }).filter({ hasText: "Valutazione posturale" })).toHaveCount(1);
  await expect(page.locator("#tutti-i-pagamenti li").filter({ hasText: name }).filter({ hasText: "Coaching trimestrale" })).toHaveCount(2);
});
