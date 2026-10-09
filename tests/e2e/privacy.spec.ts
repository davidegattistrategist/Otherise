/** Privacy (informativa, consenso, diritti) e chiusura manuale dei pacchetti. */
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

test("l'informativa è pubblica e mostra il titolare", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Informativa sul trattamento dei dati personali" })).toBeVisible();
  await expect(page.getByText("Diego Prova").first()).toBeVisible();
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Informativa privacy" })).toBeVisible();
});

test("il cliente revoca il consenso e lo ridà", async ({ page }) => {
  await login(page, "giulia@prova.local");
  await page.goto("/cliente/profilo");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/Consenso sui dati relativi alla salute dato il/)).toBeVisible();
  await page.getByRole("button", { name: "Revoca il consenso" }).click();
  await page.waitForURL("**/consenso");
  // senza consenso l'area cliente non si apre
  await page.goto("/cliente/programma");
  await page.waitForURL("**/consenso");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Conferma e continua" }).click();
  await expect(page).toHaveURL(/\/consenso/);
  await page.getByLabel("Ho letto l'informativa sul trattamento dei miei dati.").check();
  await page.getByLabel(/Acconsento al trattamento dei miei dati relativi alla salute/).check();
  await page.getByRole("button", { name: "Conferma e continua" }).click();
  await page.waitForURL((u) => u.pathname === "/cliente");
  // richiesta di una copia dei dati
  await page.goto("/cliente/profilo");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Chiedi una copia" }).click();
  await expect(page.getByText("Richiesta inviata. Ti rispondiamo entro un mese.")).toBeVisible();
});

test("il titolare scarica i dati di un cliente, il collaboratore no", async ({ page, browser }) => {
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Giulia Esempio");
  await page.goto(`/staff/clienti/${id}/profilo`);
  await expect(page.getByText(/Consenso dati salute:/)).toBeVisible();
  const res = await page.request.get(`/api/clienti/${id}/export`);
  expect(res.status()).toBe(200);
  const data = await res.json();
  expect(data.cliente.first_name).toBe("Giulia");
  expect(Array.isArray(data.checks)).toBe(true);
  const ctx = await browser.newContext();
  const coach = await ctx.newPage();
  await login(coach, "collaboratore@prova.local");
  expect((await coach.request.get(`/api/clienti/${id}/export`)).status()).toBe(403);
  await ctx.close();
});

test("il titolare chiude a mano un pacchetto e può annullare", async ({ page }) => {
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Luca Prova");
  await page.goto(`/staff/clienti/${id}/pagamenti`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Segna il pacchetto come terminato" }).click();
  await expect(page.getByText("Pacchetto segnato come terminato.")).toBeVisible();
  await expect(page.getByText("Pacchetto finito").first()).toBeVisible();
  await expect(page.getByText(/Chiuso a mano il/)).toBeVisible();
  await page.getByRole("button", { name: "Annulla" }).click();
  await expect(page.getByText(/sessioni? rimast/).first()).toBeVisible();
});
