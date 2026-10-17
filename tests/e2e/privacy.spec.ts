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
  // un solo consenso obbligatorio; il permesso per Instagram è a parte e facoltativo
  await page.getByLabel(/Ho letto l'informativa e acconsento/).check();
  await expect(page.getByLabel(/Facoltativo: autorizzo/)).not.toBeChecked();
  await page.getByRole("button", { name: "Conferma e continua" }).click();
  await page.waitForURL((u) => u.pathname === "/cliente");
  // il permesso per Instagram si può dare anche dopo, dalla privacy
  await page.goto("/cliente/profilo");
  await page.getByRole("button", { name: "Dai il permesso" }).click();
  await expect(page.getByText(/Ci hai dato il permesso di pubblicare su Instagram/)).toBeVisible();
  await page.getByRole("button", { name: "Togli il permesso" }).click();
  await expect(page.getByText(/non pubblichiamo nulla di te/)).toBeVisible();
  // richiesta di una copia dei dati
  await page.goto("/cliente/profilo");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Chiedi una copia" }).click();
  await expect(page.getByText("Richiesta inviata. Ti rispondiamo entro un mese.")).toBeVisible();
});

test("chi non dà il permesso per Instagram: avviso al titolare, che sa dove il cliente può darlo", async ({ page }) => {
  await login(page, "titolare@prova.local");
  await page.goto("/staff/notifiche");
  await expect(page.getByText(/Esempio non ha dato il permesso per Instagram|Giulia Esempio non ha dato il permesso per Instagram/).first()).toBeVisible();
  await expect(page.getByText(/Percorso → Privacy → Video sui social/).first()).toBeVisible();
});

test("il titolare scarica i dati di un cliente, il collaboratore no", async ({ page, browser }) => {
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Esempio Giulia");
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
  const id = await openClient(page, "Prova Luca");
  await page.goto(`/staff/clienti/${id}/pagamenti`);
  await page.waitForLoadState("networkidle");
  await page.locator("#sistema summary", { hasText: "Chiudi il pacchetto" }).click();
  await page.getByRole("button", { name: "Segna il pacchetto come terminato" }).click();
  await expect(page.getByText("Pacchetto segnato come terminato.")).toBeVisible();
  await expect(page.getByText("Pacchetto finito").first()).toBeVisible();
  await expect(page.getByText(/Chiuso a mano il/)).toBeVisible();
  await page.getByRole("button", { name: "Annulla" }).click();
  // aspetta che l'annullamento sia salvato (il progetto "telefono" ripete la prova sugli stessi dati)
  await expect(page.getByText(/Chiuso a mano il/)).toHaveCount(0);
  // il pacchetto è di nuovo aperto: si può richiudere (le sessioni rimaste dipendono dalle altre prove)
  await expect(page.locator("#sistema summary", { hasText: "Chiudi il pacchetto" })).toBeVisible();
});
