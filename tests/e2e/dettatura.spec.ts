/**
 * Dettatura "registra e trascrivi": il telefono registra la voce, il server
 * la trascrive (servizio finto nei test) e il testo finisce nella casella.
 * Provata anche come iPhone, dove il riconoscimento del browser non è affidabile.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";

const PASS = "Password-di-prova-123";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

// microfono finto del browser di prova, permesso già dato
test.use({ permissions: ["microphone"], launchOptions: { executablePath: process.env.PW_CHROMIUM, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } });

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASS);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.getByRole("button", { name: "Entra" }).click()]);
}

async function iphone(browser: Browser) {
  const ctx = await browser.newContext({
    userAgent: IPHONE,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: "it-IT",
    permissions: ["microphone"],
    storageState: { cookies: [], origins: [{ origin: "http://localhost:3000", localStorage: [{ name: "otherise:install-guide", value: "done" }, { name: "otherise:push-prompt", value: "9999999999999" }, { name: "otherise:quote-day", value: "off" }, { name: "otherise:days-open", value: "all" }] }] },
  });
  return ctx.newPage();
}

async function openClient(page: Page, name: string) {
  await page.goto("/staff/clienti");
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: new RegExp(name) }).filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}/);
  return /\/staff\/clienti\/([0-9a-f-]{36})/.exec(page.url())![1];
}

test.afterEach(async ({ browser }) => {
  for (const c of browser.contexts()) await c.close().catch(() => undefined);
});

test("note della sessione PT dettate da iPhone: registra, trascrive e scrive nella casella", async ({ browser }) => {
  const page = await iphone(browser);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Esempio Giulia");
  await page.goto(`/staff/clienti/${id}/sessioni`);
  await page.waitForLoadState("networkidle");
  const notes = page.locator("textarea[name=notes]").filter({ visible: true }).first();
  await notes.fill("Squat 4x6.");
  const detta = page.getByRole("button", { name: "Detta" }).filter({ visible: true }).first();
  await detta.click();
  // mentre registra si vede il tempo
  const rec = page.getByRole("button", { name: /0:0\d · tocca per finire/ });
  await expect(rec).toBeVisible();
  await page.waitForTimeout(1500);
  await rec.click();
  await expect(notes).toHaveValue(/^Squat 4x6\. Ciao! Oggi il pulley/);
  await expect(page.getByRole("button", { name: "Detta" }).filter({ visible: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("assistente AI da iPhone: si può preparare la bozza mentre si registra, il dettato entra nella richiesta", async ({ browser }) => {
  const page = await iphone(browser);
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Esempio Giulia");
  await page.goto(`/staff/clienti/${id}/programma`);
  await page.waitForLoadState("networkidle");
  await page.locator("a[href^='/staff/programmi/']").filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/programmi\//);
  await expect(async () => {
    await page.getByRole("button", { name: /Chiedi all'AI/ }).click({ timeout: 2000 });
    await expect(page.locator("#ai-instruction")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByText("Per dettare tocca la casella e usa il microfono della tastiera.")).toHaveCount(0);
  await page.getByRole("button", { name: "Detta" }).click();
  await expect(page.getByText(/Parla pure: quando tocchi di nuovo/)).toBeVisible();
  // casella vuota ma registrazione in corso: il pulsante è già attivo
  const send = page.getByRole("button", { name: "Prepara la bozza" });
  await expect(send).toBeEnabled();
  await page.waitForTimeout(1500);
  const sent = page.waitForRequest((r) => r.url().includes("/api/ai/program") && r.method() === "POST");
  await send.click();
  const body = (await sent).postDataJSON() as { instruction: string };
  expect(body.instruction).toContain("pulley");
  await expect(page.locator("#ai-instruction")).toHaveValue(/pulley/);
});

test("microfono negato: lo dice e spiega come consentirlo", async ({ browser }) => {
  const page = await iphone(browser);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error("negato"), { name: "NotAllowedError" }));
  });
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Esempio Giulia");
  await page.goto(`/staff/clienti/${id}/sessioni`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Detta" }).filter({ visible: true }).first().click();
  await expect(page.getByText(/Il microfono non è consentito/).filter({ visible: true }).first()).toBeVisible();
});

test("il cliente detta nel logbook e nel diario (iPhone)", async ({ browser }) => {
  const page = await iphone(browser);
  await login(page, "giulia@prova.local");
  await page.goto("/cliente");
  await page.getByRole("link", { name: /Inizia l'allenamento|Riprendi l'allenamento/ }).first().click();
  await page.waitForURL(/\/cliente\/sessione\//);
  const notes = page.locator("#session-notes");
  await expect(async () => {
    // "Detta" della nota finale (ogni esercizio ha il suo)
    await page.locator("section", { has: page.locator("#session-notes") }).getByRole("button", { name: "Detta" }).first().click({ timeout: 2000 });
    await expect(page.getByRole("button", { name: /tocca per finire/ })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /tocca per finire/ }).click();
  await expect(notes).toHaveValue(/pulley/);
  // pulisco: la nota di prova non resta
  await notes.fill("");
  await expect(page.getByText(/Salvato alle/)).toBeVisible({ timeout: 10_000 });
});
