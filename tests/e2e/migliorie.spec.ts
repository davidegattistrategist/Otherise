/** Funzioni aggiunte dopo la prima versione: pagamenti rapidi, export, progressioni, registrazione per il cliente, AI sui check-up. */
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
  await page.getByRole("button", { name: "Metti gratis" }).click();
  await expect(page.getByText("Non compare in pagamenti, scadenze, incassi, previsioni ed export")).toBeVisible();
  await expect(page.getByText("Gratis", { exact: true }).first()).toBeVisible();
  await page.goto("/staff/pagamenti");
  await expect(page.getByText("Incassi per mese")).toBeVisible();
  await expect(page.getByText("Demo Marta")).toHaveCount(0);
  await page.goto(`${base}/pagamenti`);
  await page.getByRole("button", { name: "Non è più gratis" }).click();
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
  await page.goto(`${base}/checkup`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Prepara il riassunto" }).click();
  await expect(page.getByText("Cosa funziona")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /Usala come risposta/ }).click();
  await expect(page.locator("textarea[name=coach_reply]").first()).toHaveValue(/Grazie per il check-up/);
});

test("il cliente vede record ed esercizi nei progressi", async ({ page }) => {
  await login(page, "giulia@prova.local");
  await page.goto("/cliente/progressi");
  await expect(page.getByText("I tuoi esercizi")).toBeVisible();
  await expect(page.getByText("I tuoi record")).toBeVisible();
});
