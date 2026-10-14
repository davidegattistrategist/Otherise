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
  await expect(page.locator("#weight_kg")).toHaveValue("64,1");
  await expect(page.getByText(/Ho ripreso quello che avevi scritto/)).toBeVisible();
  await page.getByRole("button", { name: "Ricomincia da capo" }).click();
  await expect(page.locator("#weight_kg")).toHaveValue("");
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
  await expect(page.getByLabel("Confronta i check precedenti")).toBeVisible();
  await page.getByRole("button", { name: "Programma" }).click();
  await expect(page.getByText("Programma in corso")).toBeVisible();
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
