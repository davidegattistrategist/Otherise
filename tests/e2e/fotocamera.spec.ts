/**
 * Modalità check: "Scatta le foto" apre la fotocamera dentro l'app, ogni
 * scatto si carica subito (ridotto come quelli della galleria), "Fatto" chiude
 * e le foto sono nel check. Chromium con una fotocamera finta.
 */
import { chromium, expect, test, type Page } from "@playwright/test";

const PASS = "Password-di-prova-123";

async function login(page: Page, email: string) {
  page.on("dialog", (d) => void d.accept());
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASS);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.getByRole("button", { name: "Entra" }).click()]);
}

test("modalità check: si scattano le foto dall'app e si caricano da sole", async ({}, info) => {
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM || undefined,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
  const use = info.project.use;
  const ctx = await browser.newContext({ ...use, baseURL: use.baseURL, storageState: use.storageState as never, permissions: ["camera"] });
  const page = await ctx.newPage();
  try {
    await login(page, "titolare@prova.local");
    await page.goto("/staff/clienti");
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: /Esempio Giulia/ }).filter({ visible: true }).first().click();
    await page.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}/);
    const id = /\/staff\/clienti\/([0-9a-f-]{36})/.exec(page.url())![1];
    await page.getByRole("button", { name: "Inizia il check" }).first().click();
    await page.waitForURL(new RegExp(`/check/${id}$`));

    await page.locator("[data-open-camera]").click();
    const cam = page.locator("[data-check-camera]");
    await expect(cam).toBeVisible();
    const shoot = cam.locator("[data-camera-shoot]");
    await expect(shoot).toBeEnabled({ timeout: 15_000 });
    for (let i = 0; i < 3; i++) {
      await shoot.click();
      await expect(cam.locator("[data-camera-count]")).toHaveText(i === 0 ? "1 scatto" : `${i + 1} scatti`);
    }
    // mentre scatti le prime partono già
    await expect(cam.locator("[data-camera-status]")).toContainText(/Carico|foto caricat/);
    await cam.locator("[data-camera-done]").click();
    await expect(cam).toHaveCount(0);
    const list = page.getByRole("list", { name: "Foto caricate in questo check" }).locator("li");
    await expect(list).toHaveCount(3, { timeout: 30_000 });
    // la fotocamera si è spenta
    expect(await page.evaluate(() => document.querySelectorAll("video").length)).toBe(0);

    // via il check di prova (e i file caricati)
    await page.getByRole("button", { name: "Annulla il check" }).click();
    await page.waitForURL(new RegExp(`/staff/clienti/${id}$`));
  } finally {
    await ctx.close();
    await browser.close();
  }
});
