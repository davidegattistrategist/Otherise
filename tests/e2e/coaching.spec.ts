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
