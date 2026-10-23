/** Modalità check, misure precedenti accanto, salvataggio automatico, grafici con un tocco, link in chat. */
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
  await page.getByRole("link", { name: new RegExp(name) }).filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}/);
  return /\/staff\/clienti\/([0-9a-f-]{36})/.exec(page.url())![1];
}

test("check: le misure di prima accanto, e quello che scrivi resta anche se esci", async ({ page }) => {
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Esempio Giulia");
  await page.goto(`/staff/clienti/${id}/check/nuovo`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/Accanto a ogni misura: quella del check del/)).toBeVisible();
  // accanto ai campi le misure del check prima (le altre prove possono averne aggiunto uno senza peso)
  await expect(page.getByText(/^prima \d/).first()).toBeVisible();
  await page.locator("#weight_kg").fill("64,1");
  await expect(page.getByText(/Salvato in automatico alle/)).toBeVisible();
  // esco senza salvare e torno: il peso c'è ancora
  await page.goto("/staff");
  await page.goto(`/staff/clienti/${id}/check/nuovo`);
  // durante il caricamento la pagina può avere per un attimo una copia nascosta del modulo
  const weight = page.locator("#weight_kg").filter({ visible: true }).first();
  await expect(weight).toHaveValue("64,1");
  await expect(page.getByText(/Non si è perso niente: c’è quello che avevi scritto/)).toBeVisible();
  await page.getByRole("button", { name: "Svuota il modulo" }).click();
  await expect(weight).toHaveValue("");
});

test("modalità check: si entra, si chiude per ora, si riprende con tutto quello che avevi scritto", async ({ page }) => {
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Esempio Giulia");
  await page.getByRole("button", { name: "Inizia il check" }).first().click();
  await page.waitForURL(new RegExp(`/check/${id}$`));
  await expect(page.getByText("Modalità check").first()).toBeVisible();
  await page.locator("#weight_kg").fill("63,9");
  await expect(page.getByText(/Salvato in automatico alle/)).toBeVisible();
  // i confronti e il programma senza uscire
  await page.getByRole("button", { name: "Confronti" }).click();
  await expect(page.getByLabel("Confronta i check")).toBeVisible();
  await page.getByRole("button", { name: "Programma" }).click();
  await expect(page.getByText("Programma in corso")).toBeVisible();
  // di partenza il programma in corso; quelli prima si aprono se servono
  const older = page.locator("[data-older-programs]");
  await expect(older).toContainText("Fase 1");
  await older.locator("summary").first().click();
  await expect(older.locator("details details").first()).toBeVisible();
  await page.getByRole("button", { name: "Appunti" }).click();
  await expect(page.locator("#notes_next_phase")).toBeVisible();
  // chiudi per ora: in basso c'è "Riprendi"
  await page.getByRole("button", { name: "Chiudi per ora" }).click();
  await page.waitForURL(new RegExp(`/staff/clienti/${id}$`));
  const resume = page.getByRole("button", { name: /Check in corso con Giulia Esempio/ });
  await expect(resume).toBeVisible({ timeout: 15000 });
  await resume.click();
  await page.waitForURL(new RegExp(`/check/${id}$`));
  await expect(page.locator("#weight_kg")).toHaveValue("63,9");
  // annullo: si esce e il check in corso sparisce
  await page.getByRole("button", { name: "Annulla il check" }).click();
  await page.waitForURL(new RegExp(`/staff/clienti/${id}$`));
  await page.waitForTimeout(2500);
  await expect(page.getByRole("button", { name: /Check in corso con/ })).toHaveCount(0);
});

test("progressi del cliente: circonferenze e pliche cambiano con un tocco, massa grassa anche in kg", async ({ page }) => {
  await login(page, "giulia@prova.local");
  await page.goto("/cliente/progressi");
  await page.getByRole("group", { name: "Circonferenza" }).getByRole("button", { name: "Fianchi" }).click();
  await expect(page.getByRole("img", { name: /^Fianchi: da / })).toBeVisible();
  await page.getByRole("group", { name: "Massa grassa in" }).getByRole("button", { name: "kg" }).click();
  await expect(page.getByRole("img", { name: /^Massa grassa in kg: da / })).toBeVisible();
  await page.getByRole("group", { name: "Plica" }).getByRole("button", { name: "Addominale" }).click();
  await expect(page.getByRole("img", { name: /^Addominale: da / })).toBeVisible();
  await expect(page.getByLabel("Confronta due check")).toBeVisible();
  // niente esce dallo schermo (era il problema sull'iPhone)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test("chat: i link nei messaggi si possono aprire", async ({ page }, info) => {
  await login(page, "giulia@prova.local");
  await page.goto("/cliente/messaggi");
  const url = `https://example.com/scheda-${info.project.name}`;
  await page.getByPlaceholder("Scrivi un messaggio").fill(`Guarda qui ${url}.`);
  await page.getByRole("button", { name: "Invia" }).click();
  const link = page.getByRole("link", { name: url }).last();
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", url);
  await expect(link).toHaveAttribute("target", "_blank");
});

/** id dei check salvati nella pagina Check del cliente */
async function checkIds(page: Page, id: string) {
  await page.goto(`/staff/clienti/${id}/check`);
  await page.waitForLoadState("networkidle");
  return page.evaluate(() => [...new Set([...document.querySelectorAll<HTMLAnchorElement>("a[href*='/check/']")].map((a) => /\/check\/([0-9a-f-]{36})/.exec(a.getAttribute("href") ?? "")?.[1]).filter(Boolean))]);
}

test("modalità check su due dispositivi: 'Check finito' toccato due volte da quello rimasto indietro salva una volta, con gli appunti, e chiude", async ({ page, browser }, info) => {
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Sara");
  const before = await checkIds(page, id);
  await page.goto(`/staff/clienti/${id}`);
  await page.getByRole("button", { name: "Inizia il check" }).first().click();
  await page.waitForURL(new RegExp(`/check/${id}$`));
  await expect(page.locator("#weight_kg")).toBeVisible();

  // il secondo dispositivo è aperto sullo stesso check, poi lo schermo si spegne (niente aggiornamenti)
  const other = await (await browser.newContext(info.project.use)).newPage();
  await login(other, "titolare@prova.local");
  await other.goto(`/check/${id}`);
  await expect(other.locator("#weight_kg")).toBeVisible();
  await other.waitForTimeout(800);
  await other.evaluate(() => Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }));

  // sul primo si scrivono misure e appunti
  const notes = `Appunti da non perdere (${info.project.name}): più lavoro sul core.`;
  await page.locator("#weight_kg").fill("61,4");
  await page.getByRole("button", { name: "Appunti" }).click();
  const saved = page.waitForResponse((r) => r.url().includes("/api/bozze") && r.request().method() === "POST");
  await page.locator("#notes_next_phase").fill(notes);
  await saved;
  await page.waitForTimeout(500);
  await expect(other.locator("#notes_next_phase")).toHaveValue("");

  // dall'altro, rimasto indietro: due tocchi veloci su "Check finito"
  await other.locator("button[form='check-form']").dblclick();
  await other.waitForURL(/\/check\/[0-9a-f-]{36}\?salvato=1/, { timeout: 20000 });
  await expect(other.getByText(/non riuscito|Non sono riuscito/)).toHaveCount(0);
  const savedId = /\/check\/([0-9a-f-]{36})/.exec(other.url())![1];
  await expect(other.locator("#notes_next_phase").filter({ visible: true }).first()).toHaveValue(notes);
  await expect(other.locator("#weight_kg").filter({ visible: true }).first()).toHaveValue("61,4");
  // un check solo in più
  const after = await checkIds(other, id);
  expect(after.length).toBe(before.length + 1);
  expect(after).toContain(savedId);
  // anche il primo dispositivo esce dalla modalità check
  await page.waitForURL((u) => !u.pathname.startsWith("/check/"), { timeout: 20000 });

  // via il check di prova
  await other.goto(`/staff/clienti/${id}/check/${savedId}`);
  await other.getByRole("button", { name: "Elimina check" }).click();
  await other.waitForURL(new RegExp(`/staff/clienti/${id}/check$`));
  await other.context().close();
});

test("modalità check: le misure di oggi entrano subito nei confronti (anche sull'altro dispositivo) e, finito il check, nei progressi del cliente", async ({ page, browser }, info) => {
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Esempio Giulia");
  await page.getByRole("button", { name: "Inizia il check" }).first().click();
  await page.waitForURL(new RegExp(`/check/${id}$`));
  await expect(page.locator("#weight_kg")).toBeVisible();

  // l'altro dispositivo guarda i confronti
  const other = await (await browser.newContext(info.project.use)).newPage();
  await login(other, "titolare@prova.local");
  await other.goto(`/check/${id}`);
  await other.getByRole("button", { name: "Confronti" }).click();
  await expect(other.getByText("Appena scrivi una misura")).toBeVisible();

  // qui si scrive il peso: là compare il check di oggi, nel confronto e nel grafico
  await page.locator("#weight_kg").fill("61,7");
  await expect(other.locator("[data-live-check]")).toBeVisible({ timeout: 15000 });
  const compare = other.getByLabel("Confronta i check");
  await expect(compare.getByLabel("Dopo")).toHaveValue("check-in-corso");
  await expect(compare.getByLabel("Dopo").locator("option:checked")).toHaveText("Oggi · in corso");
  await expect(compare).toContainText("61,7");
  await expect(other.getByRole("img", { name: /^Peso: da .* a 61,7 kg$/ })).toBeVisible();
  // e anche qui, dalla scheda Confronti
  await page.getByRole("button", { name: "Confronti" }).click();
  await expect(page.getByRole("img", { name: /^Peso: da .* a 61,7 kg$/ })).toBeVisible();

  // check finito: il cliente lo trova nei progressi
  await page.locator("button[form='check-form']").click();
  await page.waitForURL(/\/check\/[0-9a-f-]{36}\?salvato=1/, { timeout: 20000 });
  const savedId = /\/check\/([0-9a-f-]{36})/.exec(page.url())![1];
  const client = await (await browser.newContext(info.project.use)).newPage();
  await login(client, "giulia@prova.local");
  await client.goto("/cliente/progressi");
  await expect(client.getByRole("img", { name: /^Peso: da / })).toBeVisible();
  // il check di oggi è tra quelli da confrontare (altre prove possono averne salvato un altro oggi)
  const box = client.getByLabel("Confronta due check");
  const after = box.getByLabel("Dopo");
  const values = await after.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  let found = false;
  for (const v of values.reverse()) {
    await after.selectOption(v);
    if ((await box.innerText()).includes("61,7")) {
      found = true;
      break;
    }
  }
  expect(found).toBe(true);
  await client.context().close();
  await other.context().close();

  // via il check di prova
  await page.goto(`/staff/clienti/${id}/check/${savedId}`);
  await page.getByRole("button", { name: "Elimina check" }).click();
  await page.waitForURL(new RegExp(`/staff/clienti/${id}/check$`));
});
