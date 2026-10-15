/**
 * Sessione PT con l'allenamento del programma (un passo solo), foto scelte
 * nel modulo del check, note del cliente: l'AI decide quali arrivano in Oggi,
 * tutto nella linea del tempo "Note".
 */
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const PASS = "Password-di-prova-123";
const FIX = path.join(__dirname, "fixtures");

async function login(page: Page, email: string) {
  page.on("dialog", (d) => void d.accept());
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASS);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.getByRole("button", { name: "Entra" }).click()]);
}

async function openClient(page: Page, name: string) {
  await page.goto(`/staff/clienti?q=${encodeURIComponent(name.split(" ")[1])}`);
  await page.locator('a[href^="/staff/clienti/"]', { hasText: name }).filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname;
}

/** Chiude l'allenamento: se ci sono serie non spuntate conferma che sono saltate. */
async function finish(page: Page, label: RegExp) {
  await page.getByRole("button", { name: label }).last().click();
  const ask = page.getByRole("dialog", { name: "Serie non spuntate" });
  if (await ask.isVisible({ timeout: 2_000 }).catch(() => false)) await ask.getByRole("button", { name: "Sì, le ho saltate" }).click();
}

test.afterEach(async ({ browser }) => {
  for (const c of browser.contexts()) await c.close().catch(() => undefined);
});

test("Sessione PT: scegli un allenamento del programma, note della lezione in fondo, si salva tutto insieme", async ({ page }, info) => {
  const tag = `${info.project.name}-${Date.now() % 100000}`;
  await login(page, "titolare@prova.local");
  const base = await openClient(page, "Prova Luca");
  await page.getByRole("link", { name: "Sessione PT", exact: true }).first().click();
  await page.waitForURL(/\/sessione-pt$/);
  await expect(page.getByText("Un allenamento del suo programma")).toBeVisible();
  await expect(page.getByRole("link", { name: /Lezione libera/ })).toBeVisible();
  await page.getByRole("link", { name: /Il prossimo/ }).click();
  await page.waitForURL(/\/allenamento\/.*\?pt=1$/);
  await page.waitForLoadState("networkidle");
  const box = page.getByRole("region", { name: "Sessione PT" });
  await expect(box.getByRole("checkbox", { name: /Sessione PT con te/ })).toBeChecked();
  await box.locator("#pt-notes").fill(`Lezione ${tag}: squat ok, spalla da tenere d'occhio`);
  await finish(page, /Salva come fatto|^Salva$/);
  await page.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}\?fatto=1/);
  await page.goto(`${base}/sessioni`);
  await expect(page.getByText(`Lezione ${tag}: squat ok, spalla da tenere d'occhio`).filter({ visible: true }).first()).toBeVisible();
  // nella linea del tempo dei tuoi appunti, legata all'allenamento
  await page.goto(`${base}/note`);
  const item = page.locator("li", { hasText: `Lezione ${tag}` });
  await expect(item).toContainText("Sessione PT ·");
  await expect(item).toContainText("settimana");
});

test("check: le foto si scelgono nel modulo e si caricano salvando", async ({ page }) => {
  await login(page, "titolare@prova.local");
  const base = await openClient(page, "Esempio Giulia");
  await page.goto(`${base}/check/nuovo`);
  await page.waitForLoadState("networkidle");
  await page.locator("#weight_kg").fill("61,2");
  // i test sono chiusi di serie
  await expect(page.locator('input[name="test_0_exercise"]')).toBeHidden();
  await page.locator('input[aria-label="Scegli le foto da caricare con il check"]').setInputFiles([path.join(FIX, "foto-check.jpg"), path.join(FIX, "foto.jpg")]);
  await expect(page.getByRole("list", { name: "Foto scelte" }).locator("li")).toHaveCount(2);
  await page.getByRole("button", { name: "Salva check e 2 foto" }).click();
  await expect(page.getByText("Check salvato con 2 foto.")).toBeVisible({ timeout: 30_000 });
});

test("note del cliente: quella importante arriva in Oggi con il motivo, tutte nella sua linea del tempo", async ({ browser }, info) => {
  test.skip(info.project.name !== "pc", "basta una volta: chiude un allenamento del cliente");
  const tag = `${Date.now() % 100000}`;
  const client = await (await browser.newContext(info.project.use)).newPage();
  await login(client, "luca@prova.local");
  await client.goto("/cliente");
  await client.getByRole("link", { name: /Inizia l'allenamento|Riprendi l'allenamento/ }).first().click();
  await client.waitForURL(/\/cliente\/sessione\//);
  await client.waitForLoadState("networkidle");
  await client.locator("#session-notes").fill(`Male al ginocchio sullo squat ${tag}, posso fare la pressa?`);
  await finish(client, /Ho finito|^Salva$/);
  await client.waitForURL(/\/cliente\?fatto=1/);

  const staff = await (await browser.newContext(info.project.use)).newPage();
  await login(staff, "titolare@prova.local");
  const card = staff.locator("section", { hasText: "Note dei clienti da leggere" });
  await expect(async () => {
    await staff.goto("/staff");
    await expect(card.locator("li", { hasText: tag })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  const row = card.locator("li", { hasText: tag });
  await expect(row).toContainText("Fastidio al ginocchio sullo squat");
  await row.getByRole("link").click();
  await staff.waitForURL(/\/note\?vista=cliente$/);
  await expect(staff.locator("li", { hasText: tag })).toContainText("Fastidio al ginocchio sullo squat");
  await staff.goto("/staff");
  await staff.locator("section", { hasText: "Note dei clienti da leggere" }).locator("li", { hasText: tag }).getByRole("button", { name: "Letta" }).click();
  await expect(staff.locator("li", { hasText: tag })).toHaveCount(0);
});

test("il cliente trova il diario in Percorso", async ({ page }) => {
  await login(page, "giulia@prova.local");
  await page.goto("/cliente/profilo");
  await page.getByRole("link", { name: /Il tuo diario/ }).click();
  await page.waitForURL(/\/cliente\/diario$/);
  await expect(page.getByRole("heading", { name: "Diario settimanale" })).toBeVisible();
});

test("Sessione PT finita a metà: l'allenamento resta aperto e il cliente lo riprende dal suo telefono", async ({ page, browser }) => {
  await login(page, "titolare@prova.local");
  await openClient(page, "Prova Luca");
  await page.getByRole("link", { name: "Sessione PT", exact: true }).first().click();
  await page.waitForURL(/\/sessione-pt$/);
  await page.getByRole("link", { name: /Il prossimo/ }).click();
  await page.waitForURL(/\/allenamento\/.*\?pt=1$/);
  await page.waitForLoadState("networkidle");
  const dayTitle = (await page.locator("h2", { hasText: /· settimana \d+$/ }).first().innerText()).replace(/ · settimana \d+$/, "");
  await page.locator('input[aria-label$="serie 1, chili"]').first().fill("41");
  await expect(page.getByText(/Salvato alle/)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Salva come fatto" }).last().click();
  await page.getByRole("dialog", { name: "Serie non spuntate" }).getByRole("button", { name: /Le finisce in autonomia/ }).click();
  await page.waitForURL(/\?aperto=1/);
  await expect(page.getByText(/L'allenamento resta aperto/)).toBeVisible();

  // il cliente lo trova aperto, ed è ancora il prossimo
  const { origins } = await page.context().storageState();
  const client = await browser.newContext({ storageState: { cookies: [], origins }, viewport: page.viewportSize() ?? undefined });
  const cp = await client.newPage();
  await login(cp, "luca@prova.local");
  await cp.goto("/cliente/programma");
  const card = cp.locator("[data-day-card]", { hasText: dayTitle }).first();
  await expect(card).toContainText("Iniziato");
  await expect(card).toContainText("Prossimo");
  await expect(card.getByRole("link", { name: "Riprendi l'allenamento" })).toBeVisible();
});

test("un allenamento aperto per sbaglio e svuotato non risulta iniziato", async ({ page }) => {
  await login(page, "giulia@prova.local");
  await page.goto("/cliente/programma");
  const card = page.locator("[data-day-card]").filter({ has: page.getByRole("link", { name: "Inizia questo allenamento" }) }).last();
  const title = (await card.locator("h2").innerText()).replace(/\s*Prossimo$/, "");
  await card.getByRole("link", { name: "Inizia questo allenamento" }).click();
  await page.waitForURL(/\/cliente\/sessione\//);
  await page.waitForLoadState("networkidle");
  const notes = page.locator("#session-notes");
  await notes.fill("aperto per sbaglio");
  await expect(page.getByText(/Salvato alle/)).toBeVisible({ timeout: 10_000 });
  await notes.fill("");
  await page.waitForTimeout(3_000);
  await expect
    .poll(async () => {
      await page.goto("/cliente/programma");
      return page.locator("[data-day-card]", { hasText: title }).first().innerText();
    }, { timeout: 20_000 })
    .not.toContain("Iniziato");
});
