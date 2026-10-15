/**
 * Migliorie del controllo generale (15/10): schede della scheda cliente con
 * "Altro", Sessione PT senza programma, nuova fase in evidenza, logbook con
 * "3 di 8 esercizi", recupero con "+30 s" e "Salta", spiegazione la prima
 * volta, programma del cliente con i giorni chiusi, "Mostra" la password,
 * grafici da toccare.
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
  await page.getByRole("link", { name: new RegExp(name) }).filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}/);
  return /\/staff\/clienti\/([0-9a-f-]{36})/.exec(page.url())![1];
}

test("accesso: \"Mostra\" fa vedere la password scritta", async ({ page }) => {
  await page.goto("/login");
  const field = page.locator("input[name=password]");
  await field.fill("prova");
  await expect(field).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Mostra" }).click();
  await expect(field).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Nascondi" }).click();
  await expect(field).toHaveAttribute("type", "password");
});

test("scheda cliente: schede di tutti i giorni in vista, le altre in \"Altro\"", async ({ page }) => {
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Esempio Giulia");
  const tabs = page.getByRole("navigation", { name: "Sezioni" });
  for (const t of ["Panoramica", "Programma", "Check", "Diario", "Pagamenti"]) await expect(tabs.getByRole("link", { name: t, exact: true })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Note", exact: true })).toHaveCount(0);
  await page.locator("[data-tabs-more] > button").click();
  const menu = page.getByRole("menu", { name: "Altre sezioni" });
  await expect(menu.getByRole("menuitem")).toHaveText(["Sessioni PT", "Note", "Dati", "Progetto", "Posturale"]);
  await menu.getByRole("menuitem", { name: "Note" }).click();
  await page.waitForURL(new RegExp(`/staff/clienti/${id}/note`));
  // la scheda aperta compare tra quelle in vista
  await expect(tabs.getByRole("link", { name: "Note", exact: true })).toHaveAttribute("aria-current", "page");
  // con un programma già fatto la nuova fase è in primo piano, le altre strade a richiesta
  await page.goto(`/staff/clienti/${id}/programma`);
  await expect(page.getByRole("button", { name: "Crea la nuova fase" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Programma vuoto" })).toBeHidden();
  await page.getByText("da un modello o da zero").click();
  await expect(page.getByRole("button", { name: "Programma vuoto" })).toBeVisible();
});

test("Sessione PT senza programma in corso: lo dice e porta alla lezione libera", async ({ page }) => {
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Test Sara");
  await page.goto(`/staff/clienti/${id}/sessione-pt`);
  await expect(page.getByText(/Nessun programma in corso/).filter({ visible: true }).first()).toBeVisible();
  await page.getByRole("link", { name: "Registra la lezione libera" }).click();
  await page.waitForURL(new RegExp(`/staff/clienti/${id}/sessioni`));
});

test("logbook: quanti esercizi e spiegazione la prima volta", async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem("otherise:logbook-hint"));
  await login(page, "giulia@prova.local");
  await page.goto("/cliente/programma");
  // istruzioni a richiesta, i giorni chiusi tranne il prossimo
  await expect(page.getByText(/Fai gli allenamenti in ordine/)).toBeHidden();
  await page.getByText("Come funziona?").click();
  await expect(page.getByText(/Fai gli allenamenti in ordine/)).toBeVisible();
  // un allenamento con le serie non ancora fatto (l'ultima settimana): lì c'è la spiegazione
  await page.getByRole("link", { name: /^Settimana 4/ }).click();
  await expect(page).toHaveURL(/settimana=4/);
  const card = page.getByRole("heading", { name: /Gambe e spinta/ }).locator("xpath=ancestor::*[.//a[contains(@href,'/cliente/sessione/')]][1]");
  await card.locator("a[href*='/cliente/sessione/']").click();
  await page.waitForURL(/\/cliente\/sessione\//);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/^\d+ di \d+ esercizi$/)).toBeVisible();
  const hint = page.getByRole("note").filter({ hasText: "Come si usa" });
  await expect(hint).toBeVisible();
  await hint.getByRole("button", { name: "Ho capito" }).click();
  await expect(hint).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("note").filter({ hasText: "Come si usa" })).toHaveCount(0);
});

test("recupero con +30 s e Salta, poi la serie dopo si illumina", async ({ page }) => {
  await login(page, "giulia@prova.local");
  await page.goto("/cliente/programma");
  const card = page.getByRole("heading", { name: /Tirata e core/ }).locator("xpath=ancestor::*[.//a[contains(@href,'/cliente/sessione/')]][1]");
  await card.locator("a[href*='/cliente/sessione/']").click();
  await page.waitForURL(/\/cliente\/sessione\//);
  await page.waitForLoadState("networkidle");
  // lat machine con recupero 90": spunto una serie
  const row = page.locator('div:has(> input[aria-label^="Lat machine"])').first();
  const btn = row.getByRole("button");
  test.skip((await btn.getAttribute("aria-pressed")) === "true", "serie già spuntata in un altro test");
  await btn.click();
  const timer = page.getByRole("timer");
  await expect(timer).toContainText("Recupero");
  await timer.getByRole("button", { name: "30 secondi in più" }).click();
  await timer.getByRole("button", { name: "Salta" }).click();
  await expect(timer).toHaveCount(0);
  // la prossima serie da fare si illumina
  await expect(page.locator('[data-set$=":1"]').filter({ has: page.locator('input[aria-label^="Lat machine"]') })).toHaveClass(/ring-accent/);
  // pulisco
  await btn.click();
  await page.locator('input[aria-label^="Lat machine"][aria-label$="serie 1, chili"]').fill("");
  await page.locator('input[aria-label^="Lat machine"][aria-label$="serie 1, ripetizioni"]').fill("");
  await expect(page.getByText(/Salvato alle/)).toBeVisible({ timeout: 10_000 });
});

test("progressi: toccando il grafico si legge il valore", async ({ page }) => {
  await login(page, "giulia@prova.local");
  await page.goto("/cliente/progressi");
  const chart = page.locator("svg[role=img]").first();
  await expect(chart).toBeVisible();
  const box = (await chart.boundingBox())!;
  await chart.click({ position: { x: box.width / 3, y: box.height / 2 } });
  await expect(page.getByTestId("chart-tip").first()).toHaveText(/\d.*:\s*\d/);
});

test("Oggi: l'allenamento libero di sempre con un tocco", async ({ page }) => {
  await login(page, "giulia@prova.local");
  await expect(page.getByRole("button", { name: /^Rifai .+ oggi$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Oggi non puoi\?/ })).toBeVisible();
});
