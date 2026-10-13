/**
 * Coaching e lezioni PT, credito del coaching, avviso gentile al cliente,
 * diario (si chiamava check-up: i vecchi indirizzi rimandano).
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

async function newClientPayment(page: Page, name: string) {
  await page.goto("/staff/pagamenti/nuovo");
  await page.locator("#pay-search").fill(name);
  await page.getByRole("button", { name: /Cliente nuovo/ }).click();
}

test("credito: porta 500 invece di 300, il rinnovo dopo è di 100", async ({ page }, info) => {
  await login(page, "titolare@prova.local");
  const name = `Credito${info.project.name}${Date.now() % 10000}`;
  await newClientPayment(page, name);
  await page.getByRole("button", { name: /^Coaching/ }).click();
  await page.getByRole("button", { name: "6 settimane", exact: true }).click();
  await page.locator('input[name="amount"]').fill("300");
  await page.locator('select[name="method"]').selectOption("cash");
  await page.getByRole("button", { name: "Salva il pagamento" }).click();
  await expect(page.getByText("Pagamento registrato")).toBeVisible();

  // rinnovo: ne porta 500
  await page.getByRole("button", { name: "Registra un altro pagamento" }).click();
  await page.locator("#pay-search").fill(name);
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page.locator('input[name="amount"]')).toHaveValue("300");
  await page.locator('input[name="amount"]').fill("500");
  const hint = page.getByTestId("credit-hint");
  await expect(hint).toContainText("in più del dovuto");
  await expect(hint.getByRole("checkbox")).toBeChecked();
  await page.getByRole("button", { name: "Salva il pagamento" }).click();
  await expect(page.getByText("Pagamento registrato")).toBeVisible();

  // il rinnovo dopo è proposto a 100
  await page.getByRole("button", { name: "Registra un altro pagamento" }).click();
  await page.locator("#pay-search").fill(name);
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page.getByText(/Ha un credito di 200/)).toBeVisible();
  await expect(page.locator('input[name="amount"]')).toHaveValue("100");
});

test("Oggi: 'Nessun programma pubblicato' solo per chi è in coaching, non per chi fa lezioni PT", async ({ page }, info) => {
  await login(page, "titolare@prova.local");
  const tag = `${info.project.name}${Date.now() % 10000}`;
  const coaching = `Coach${tag}`;
  const pt = `Lezioni${tag}`;
  await newClientPayment(page, coaching);
  await page.getByRole("button", { name: /^Coaching/ }).click();
  await page.getByRole("button", { name: "Mensile", exact: true }).click();
  await page.locator('input[name="amount"]').fill("150");
  await page.getByRole("button", { name: "Salva il pagamento" }).click();
  await expect(page.getByText("Pagamento registrato")).toBeVisible();

  await newClientPayment(page, pt);
  await page.getByRole("button", { name: /^Lezioni PT/ }).click();
  await page.getByRole("button", { name: "5 lezioni", exact: true }).click();
  await page.locator('input[name="amount"]').fill("200");
  await page.getByRole("button", { name: "Salva il pagamento" }).click();
  await expect(page.getByText("Pagamento registrato")).toBeVisible();

  await page.goto("/staff");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("a", { hasText: coaching }).filter({ hasText: "Nessun programma pubblicato" }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.locator("a", { hasText: pt }).filter({ hasText: "Nessun programma pubblicato" })).toHaveCount(0);
});

test("il cliente vede un avviso gentile per il rinnovo, mai 'devi pagare'", async ({ page }) => {
  await login(page, "giulia@prova.local");
  await page.goto("/cliente");
  const notice = page.getByRole("region", { name: "Un pensiero sul tuo percorso" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Quando ti è comodo");
  await expect(notice.getByRole("link", { name: /Scrivi a/ })).toHaveAttribute("href", "/cliente/messaggi");
  expect((await notice.innerText()).toLowerCase()).not.toMatch(/devi pagare|scadut/);
  await page.goto("/cliente/profilo");
  await expect(page.getByRole("region", { name: "Un pensiero sul tuo percorso" })).toBeVisible();
});

test("diario: i vecchi indirizzi del check-up portano al diario", async ({ page }) => {
  await login(page, "giulia@prova.local");
  await page.goto("/cliente/checkup");
  await expect(page).toHaveURL(/\/cliente\/diario$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/[Dd]iario/);
});

test("Pagamenti: dopo 'Pagato' e da 'Tutti i pagamenti' si corregge il pagamento senza aprire la scheda", async ({ page }, info) => {
  await login(page, "titolare@prova.local");
  const name = `Correggo${info.project.name}${Date.now() % 10000}`;
  await newClientPayment(page, name);
  await page.getByRole("button", { name: /^Coaching/ }).click();
  await page.getByRole("button", { name: "Mensile", exact: true }).click();
  await page.locator('input[name="amount"]').fill("120");
  await page.getByRole("button", { name: "Salva il pagamento" }).click();
  await expect(page.getByText("Pagamento registrato")).toBeVisible();

  // "Pagato" in Pagamenti, poi "Modifica" subito lì
  await page.goto("/staff/pagamenti");
  await page.waitForLoadState("networkidle");
  const row = page.locator("li, tr", { hasText: name }).filter({ visible: true }).filter({ has: page.getByRole("button", { name: /^(Pagato|Registra)$/ }) }).first();
  await row.getByRole("button", { name: /^(Pagato|Registra)$/ }).click();
  const edit = page.getByRole("button", { name: `Modifica: pagamento di ${name}` }).filter({ visible: true }).first();
  await expect(edit).toBeVisible();
  await edit.click();
  const dialog = page.getByRole("dialog", { name: `Correggi il pagamento di ${name}` });
  await expect(dialog.locator('input[name="amount"]')).toHaveValue("120");
  await dialog.locator('input[name="amount"]').fill("100");
  await dialog.getByRole("button", { name: "Salva le modifiche" }).click();
  await expect(dialog.getByText("Pagamento corretto.")).toBeVisible();
  await dialog.getByRole("button", { name: "Chiudi" }).first().click();
  await expect(dialog).toHaveCount(0);

  // da "Tutti i pagamenti": si apre, si vede l'importo corretto, si elimina
  await page.goto("/staff/pagamenti");
  await page.locator("#tutti-i-pagamenti summary").click();
  const item = page.locator("#tutti-i-pagamenti li").filter({ hasText: name }).filter({ hasText: "100" }).first();
  await expect(item).toBeVisible();
  await item.getByRole("button", { name: /^Modifica/ }).click();
  const d2 = page.getByRole("dialog", { name: `Correggi il pagamento di ${name}` });
  await d2.getByRole("button", { name: "Elimina il pagamento" }).click();
  await d2.getByRole("button", { name: "Sì, elimina" }).click();
  await expect(d2).toHaveCount(0);
  await page.reload();
  await page.locator("#tutti-i-pagamenti summary").click();
  await expect(page.locator("#tutti-i-pagamenti li").filter({ hasText: name })).toHaveCount(1);
});

test("Pagamenti: un periodo scaduto e quello in corso sono due righe sotto il nome, ognuna col suo Pagato; si sposta il periodo dopo uno stop", async ({ page }, info) => {
  await login(page, "titolare@prova.local");
  const name = `Arretrato${info.project.name}${Date.now() % 10000}`;
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  await newClientPayment(page, name);
  await page.getByRole("button", { name: /^Coaching/ }).click();
  await page.getByRole("button", { name: "Mensile", exact: true }).click();
  await page.locator('input[name="amount"]').fill("100");
  await page.locator('input[name="period_start"]').fill(day(-75));
  await page.getByRole("button", { name: "Salva il pagamento" }).click();
  await expect(page.getByText("Pagamento registrato")).toBeVisible();

  await page.goto("/staff/pagamenti");
  await page.waitForLoadState("networkidle");
  const lines = page.getByRole("list", { name: `Pagamenti da incassare da ${name}` }).first();
  await expect(lines.locator("li")).toHaveCount(2);
  await expect(lines.locator("li").first()).toContainText("Scaduto");
  await expect(lines.locator("li").nth(1)).toContainText("Da saldare");
  // le righe sono separate: paga quello in corso, quello scaduto resta da saldare
  await lines.locator("li").nth(1).getByRole("button", { name: "Pagato" }).click();
  await expect(page.getByText(/Il periodo prima resta da saldare/).first()).toBeVisible();
  await page.reload();
  await expect(lines.locator("li")).toHaveCount(1);
  await expect(lines.locator("li").first()).toContainText("Scaduto");
  // poi paga anche quello
  await lines.locator("li").first().getByRole("button", { name: "Pagato" }).click();
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.getByRole("list", { name: `Pagamenti da incassare da ${name}` })).toHaveCount(0);

  // scheda del cliente: il prossimo periodo si sposta dopo uno stop
  const href = await page.getByRole("link", { name }).first().getAttribute("href");
  await page.goto(href!);
  const card = page.locator("#periodo");
  await card.locator("summary").click();
  await card.locator('input[name="start"]').fill(day(20));
  await card.getByRole("button", { name: "Sposta il periodo" }).click();
  await expect(card.getByText(/Fatto: il periodo da pagare va dal/)).toBeVisible();
});


test("lezioni PT: 700 invece di 630, i 70 € restano come credito e le prossime 10 lezioni costano 560", async ({ page }, info) => {
  await login(page, "titolare@prova.local");
  const name = `Lezioni${info.project.name}${Date.now() % 10000}`;
  await newClientPayment(page, name);
  await page.getByRole("button", { name: /^Lezioni PT/ }).click();
  await page.locator('input[name="pt_price"]').fill("63");
  await page.getByRole("button", { name: "10 lezioni", exact: true }).click();
  await expect(page.locator('input[name="amount"]')).toHaveValue("630");
  await page.locator('input[name="amount"]').fill("700");
  const hint = page.getByTestId("credit-hint");
  await expect(hint).toContainText("70");
  await expect(hint).toContainText("le prossime lezioni costeranno meno");
  await page.getByRole("button", { name: "Salva il pagamento" }).click();
  await expect(page.getByText(/Credito per le prossime lezioni: 70/)).toBeVisible();

  await page.getByRole("button", { name: "Registra un altro pagamento" }).click();
  await page.locator("#pay-search").fill(name);
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await page.getByRole("button", { name: /^Lezioni PT/ }).click();
  await expect(page.locator('input[name="pt_price"]')).toHaveValue("63");
  await page.getByRole("button", { name: "10 lezioni", exact: true }).click();
  await expect(page.getByTestId("lessons-due")).toContainText("560");
  await expect(page.locator('input[name="amount"]')).toHaveValue("560");
});
