/**
 * Logbook: il carico della prima serie viene proposto nelle successive e,
 * prima di chiudere, l'app chiede delle serie non spuntate.
 * Non chiude l'allenamento, così non cambia i dati degli altri test.
 */
import { expect, test, type Page } from "@playwright/test";

const PASS = "Password-di-prova-123";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASS);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.getByRole("button", { name: "Entra" }).click()]);
}

test.afterEach(async ({ browser }) => {
  for (const c of browser.contexts()) await c.close().catch(() => undefined);
});

test("stesso carico nelle serie successive e domanda sulle serie non spuntate", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "giulia@prova.local");
  await page.goto("/cliente");
  await page.getByRole("link", { name: /Inizia l'allenamento|Riprendi l'allenamento/ }).first().click();
  await page.waitForURL(/\/cliente\/sessione\//);
  await page.waitForLoadState("networkidle");

  // primo esercizio con almeno 3 serie
  const firstKg = page.locator('input[aria-label$="serie 1, chili"]');
  let name = "";
  for (let i = 0; i < (await firstKg.count()); i++) {
    const label = (await firstKg.nth(i).getAttribute("aria-label"))!;
    const n = label.replace(/, serie 1, chili$/, "");
    if ((await page.locator(`input[aria-label="${n}, serie 3, chili"]`).count()) && !(await firstKg.nth(i).inputValue())) {
      name = n;
      break;
    }
  }
  test.skip(!name, "nessun esercizio libero con 3 serie nel prossimo allenamento");
  const kg = (s: number) => page.locator(`input[aria-label="${name}, serie ${s}, chili"]`);
  const reps = (s: number) => page.locator(`input[aria-label="${name}, serie ${s}, ripetizioni"]`);

  await kg(1).fill("40");
  await expect(kg(2)).toHaveValue("40");
  await expect(kg(3)).toHaveValue("40");
  // cambio solo le ripetizioni della seconda: il carico resta
  await reps(2).fill("7");
  await expect(kg(2)).toHaveValue("40");
  // una serie cambiata a mano non segue più la prima
  await kg(2).fill("37,5");
  await kg(1).fill("42");
  await expect(kg(2)).toHaveValue("37,5");
  await expect(kg(3)).toHaveValue("42");

  // "Ho finito" con serie non spuntate: chiede prima di chiudere
  await page.getByRole("button", { name: "Ho finito" }).click();
  const ask = page.getByRole("dialog", { name: "Serie non spuntate" });
  await expect(ask).toBeVisible();
  await expect(ask.getByRole("listitem").filter({ hasText: name })).toBeVisible();
  await expect(ask.getByRole("button", { name: "Le ho fatte: segnale come fatte" })).toBeVisible();
  await expect(ask.getByRole("button", { name: "Sì, le ho saltate" })).toBeVisible();
  await ask.getByRole("button", { name: "Torno all'allenamento" }).click();
  await expect(ask).toBeHidden();
  await expect(page).toHaveURL(/\/cliente\/sessione\//);

  // pulisco: tolgo i valori di prova
  for (const s of [1, 2, 3]) await kg(s).fill("");
  await reps(2).fill("");
  await expect(page.getByText(/Salvato alle/)).toBeVisible({ timeout: 10_000 });
  expect(errors).toEqual([]);
});
