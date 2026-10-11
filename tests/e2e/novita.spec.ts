/** Progetto annuale, dolori nel logbook, domande dell'AI, allenamenti in sequenza. */
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


// le pagine aperte dai test precedenti continuerebbero a segnare come letti i messaggi
test.afterEach(async ({ browser }) => {
  for (const c of browser.contexts()) await c.close().catch(() => undefined);
});

test("progetto annuale: il trainer lo modifica, il cliente lo vede", async ({ page, browser }, info) => {
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Esempio Giulia");
  await page.goto(`/staff/clienti/${id}/progetto`);
  await page.waitForLoadState("networkidle");
  const goal = `Più forza nelle gambe (${info.project.name})`;
  await page.getByLabel(/Obiettivo dell'anno/).fill(goal);
  await page.getByRole("button", { name: /Forza massima, .*Tocca per cambiare/ }).first().click();
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page.getByText(/Progetto salvato/)).toBeVisible();

  const ctx = await browser.newContext(info.project.use);
  const client = await ctx.newPage();
  await login(client, "giulia@prova.local");
  await client.goto("/cliente/profilo");
  await expect(client.getByText("Il tuo progetto")).toBeVisible();
  await expect(client.getByText(goal)).toBeVisible();
  await expect(client.getByText("Volumizzazione").first()).toBeVisible();
  await ctx.close();
});

test("dolore nel logbook: arriva al trainer in Oggi", async ({ page, browser }, info) => {
  const tag = `${info.project.name}-${Date.now() % 100000}`;
  await login(page, "giulia@prova.local");
  await page.goto("/cliente");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/(Prossimo allenamento|Da finire) · settimana \d/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Scegli un altro allenamento/ })).toBeVisible();
  await page.getByText(/Inizia l'allenamento|Riprendi l'allenamento/).first().click();
  await page.waitForURL(/\/cliente\/sessione\//);
  await page.waitForLoadState("networkidle");
  // se un giro precedente ha già scritto un fastidio su questo allenamento, il riquadro è già aperto
  const discomfortBtn = page.getByRole("button", { name: /Hai sentito dolore o fastidio/ });
  await expect(discomfortBtn.or(page.getByLabel("Dolore o fastidio"))).toBeVisible();
  if (await discomfortBtn.isVisible()) await discomfortBtn.click();
  await page.getByLabel("Dolore o fastidio").fill(`Fastidio alla spalla ${tag}`);
  await expect(page.getByText(/Salvato alle/)).toBeVisible({ timeout: 10_000 });

  const ctx = await browser.newContext(info.project.use);
  const owner = await ctx.newPage();
  await login(owner, "titolare@prova.local");
  await owner.goto("/staff");
  await expect(owner.getByText("Dolori e fastidi")).toBeVisible();
  const row = owner.locator("li", { hasText: tag });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Visto" }).click();
  await expect(owner.locator("li", { hasText: tag })).toHaveCount(0);
  await ctx.close();
});

test("l'AI fa qualche domanda prima della bozza", async ({ page }) => {
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Esempio Giulia");
  await page.goto(`/staff/clienti/${id}/programma`);
  await page.waitForLoadState("networkidle");
  await page.locator("a[href^='/staff/programmi/']").filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/programmi\//);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Chiedi all'AI/ }).click();
  await page.locator("#ai-instruction").fill("Aggiungiamo un giorno di corsa facile e teniamo la forza.");
  await page.getByRole("button", { name: "Prepara la bozza" }).click();
  await expect(page.getByText("Prima di preparare la bozza, qualche domanda")).toBeVisible({ timeout: 20_000 });
  // se manca il tempo per seduta, prima lo chiede l'app; poi le domande dell'AI
  if (await page.getByText("Quanto tempo ha a disposizione per ogni seduta?").isVisible()) {
    await page.getByRole("button", { name: "75 minuti" }).click();
    await page.getByRole("button", { name: "Prepara la bozza con queste risposte" }).click();
    await expect(page.getByRole("button", { name: "6:30/km" })).toBeVisible({ timeout: 20_000 });
  }
  await page.getByRole("button", { name: "6:30/km" }).click();
  await page.getByRole("button", { name: "Prepara la bozza con queste risposte" }).click();
  await expect(page.getByText("Cosa ha cambiato l'AI")).toBeVisible({ timeout: 30_000 });
});

test("previsione incassi: solo il titolare, con orizzonte 3/6/12 mesi", async ({ page, browser }, info) => {
  await login(page, "titolare@prova.local");
  await page.goto("/staff/pagamenti");
  await page.getByRole("link", { name: "Previsione dei prossimi mesi" }).click();
  await expect(page.getByRole("heading", { name: "Previsione incassi" })).toBeVisible();
  await expect(page.getByText("Prossimi 30 giorni")).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(6);
  await page.getByRole("link", { name: "12 mesi" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(12);
  // toccando i mesi si vede chi deve pagare: Luca ha un rinnovo in uno dei 12 mesi
  await expect(page.getByText(/Chi deve pagare a /)).toBeVisible();
  const months = page.locator("tbody tr a");
  let found = false;
  for (let i = 0; i < 12 && !found; i++) {
    const href = (await months.nth(i).getAttribute("href"))!;
    await months.nth(i).click();
    await page.waitForURL((u) => href.includes(`mese=${u.searchParams.get("mese")}`));
    await expect(page.locator("#dettaglio").getByText(/Chi deve pagare a /)).toBeVisible();
    found = (await page.locator("#dettaglio").getByText("Prova Luca").count()) > 0;
  }
  expect(found).toBe(true);
  // il collaboratore non ci entra
  const coach = await (await browser.newContext(info.project.use)).newPage();
  await login(coach, "collaboratore@prova.local");
  await coach.goto("/staff/pagamenti/previsione");
  await expect(coach.getByRole("heading", { name: "Previsione incassi" })).toHaveCount(0);
});
