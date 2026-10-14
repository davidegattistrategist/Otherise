/**
 * Allenamento libero del cliente (in pochi tocchi), giorni del programma
 * chiusi di partenza, note a tutto schermo sul telefono, foto caricate subito
 * in modalità check.
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
  await page.goto("/staff/clienti");
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: new RegExp(name) }).filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}/);
  return /\/staff\/clienti\/([0-9a-f-]{36})/.exec(page.url())![1];
}

test("allenamento libero: il cliente lo segna in pochi tocchi e il coach lo vede", async ({ page, browser }, info) => {
  await login(page, "giulia@prova.local");
  await page.getByRole("link", { name: /Hai fatto altro\?/ }).click();
  await page.waitForURL(/\/cliente\/allenamento-libero$/);
  // le scelte dell'ultima volta sono già pronte (spinning, 45 min, duro)
  await expect(page.getByRole("radio", { name: "Spinning" })).toBeChecked();
  await page.getByText("Corsa", { exact: true }).click();
  await page.getByText("30 min", { exact: true }).click();
  await page.getByText("Ieri", { exact: true }).click();
  const note = `Lungo lento ${info.project.name}`;
  await page.locator("#free-notes").fill(note);
  await page.getByRole("button", { name: "Segna l'allenamento" }).click();
  await page.waitForURL(/\/cliente(\?libero=1)?$/);
  await expect(page.getByText(/Segnato!/)).toBeVisible();
  await page.goto("/cliente/allenamento-libero");
  await expect(page.getByText(note)).toBeVisible();
  // il coach lo trova nelle note del cliente
  const ctx = await browser.newContext(info.project.use);
  const staff = await ctx.newPage();
  await login(staff, "titolare@prova.local");
  const id = await openClient(staff, "Esempio Giulia");
  await staff.goto(`/staff/clienti/${id}/note?vista=cliente`);
  await expect(staff.locator("li", { hasText: note })).toContainText("Corsa · 30 min");
  await ctx.close();
  // e lo può togliere
  await page.getByRole("button", { name: /^Togli Corsa/ }).first().click();
  await expect(page.getByText(note)).toHaveCount(0);
});

test("programma: i giorni partono chiusi e si aprono e chiudono a piacimento", async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem("otherise:days-open"));
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Esempio Giulia");
  await page.goto(`/staff/clienti/${id}/programma`);
  await page.waitForLoadState("networkidle");
  await page.locator("a[href^='/staff/programmi/']").filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/programmi\//);
  const toggles = page.locator("button[aria-controls^='daybody-']");
  await expect(toggles.first()).toHaveAttribute("aria-expanded", "false");
  await toggles.first().click();
  await expect(toggles.first()).toHaveAttribute("aria-expanded", "true");
  await toggles.first().click();
  await expect(toggles.first()).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Apri tutti i giorni" }).click();
  await expect(toggles.last()).toHaveAttribute("aria-expanded", "true");
});

test("telefono: le note della sessione si aprono a tutto schermo", async ({ page }, info) => {
  test.skip(info.project.name !== "telefono", "solo sul telefono");
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Esempio Giulia");
  await page.goto(`/staff/clienti/${id}/sessioni#nuova`);
  await page.waitForLoadState("networkidle");
  const notes = page.locator("textarea[name=notes]").filter({ visible: true }).first();
  await notes.tap();
  const dialog = page.getByRole("dialog", { name: "Note della sessione" });
  await expect(dialog).toBeVisible();
  await dialog.locator("textarea").fill("Squat ok, spalla da tenere d'occhio");
  await dialog.getByRole("button", { name: "Fatto" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(notes).toHaveValue("Squat ok, spalla da tenere d'occhio");
});

test("modalità check: le foto si caricano subito e entrano nel check con 'Check finito'", async ({ page }) => {
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Esempio Giulia");
  await page.getByRole("button", { name: "Inizia il check" }).first().click();
  await page.waitForURL(new RegExp(`/check/${id}$`));
  await page.locator("#weight_kg").fill("63,7");
  await page.getByTestId("pending-photo-input").setInputFiles([path.join(FIX, "foto-check.jpg")]);
  await expect(page.getByRole("list", { name: "Foto caricate in questo check" }).locator("li")).toHaveCount(1, { timeout: 20_000 });
  await page.getByRole("button", { name: "Check finito" }).first().click();
  await page.waitForURL(/\/check\?salvato=/, { timeout: 20_000 });
  const saved = /salvato=([0-9a-f-]{36})/.exec(page.url())![1];
  await page.goto(`/staff/clienti/${id}/check/${saved}`);
  await expect(page.getByRole("list", { name: "Foto del check" }).locator("li")).toHaveCount(1);
});
