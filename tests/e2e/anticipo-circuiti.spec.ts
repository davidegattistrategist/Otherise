/**
 * Fase nuova iniziata in anticipo e logbook dei circuiti (dati di Nadia nel seed):
 * - "Inizia oggi la nuova fase" quando la prossima parte domani;
 * - circuito vogatore 250 m + push up "max": le serie dei push up si scrivono e
 *   fanno partire il recupero, e la serie dopo segue il giro del circuito;
 * - "Segna tutto il circuito come fatto" con Annulla;
 * - side plank 30" per lato: timer con primo lato, cambio e secondo lato.
 */
import { expect, test, type Page } from "@playwright/test";

const PASS = "Password-di-prova-123";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASS);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.getByRole("button", { name: "Entra" }).click()]);
}

test("nuova fase in anticipo, circuito con serie max, segna tutto e timer per lato", async ({ page }, info) => {
  test.setTimeout(120_000);
  await login(page, "nadia@prova.local");
  await page.goto("/cliente");

  // la prima volta (progetto "pc") la fase parte domani: si inizia oggi
  const early = page.locator("[data-early-start]");
  if (await early.count()) {
    await expect(early).toContainText("HYROX · Circuiti");
    await early.getByRole("button", { name: "Inizia oggi la nuova fase" }).click();
    await early.getByRole("button", { name: "Sì, inizio oggi" }).click();
    await expect(page.locator("[data-early-start]")).toHaveCount(0);
  }
  await expect(page.getByText("Giorno 1 · Circuito").first()).toBeVisible();
  const href = await page.getByRole("link", { name: /Inizia l'allenamento|Riprendi l'allenamento/ }).getAttribute("href");
  const [, , , programId, , dayId] = href!.split("/");
  // il secondo giro di test (telefono) usa la settimana 2, così parte da zero
  const week = info.project.name === "telefono" ? 2 : 1;
  await page.goto(`/cliente/sessione/${programId}/${week}/${dayId}`);

  const vog = page.locator("[data-item]").filter({ hasText: "Vogatore" });
  const push = page.locator("[data-item]").filter({ hasText: "Push up" });
  const vogId = await vog.getAttribute("data-item");
  const pushId = await push.getAttribute("data-item");

  // vogatore giro 1 → si illumina il push up dello stesso giro (non il vogatore 2)
  await vog.getByRole("button", { name: /250 m/ }).first().click();
  await expect(page.locator(`[data-set="${pushId}:0"]`)).toHaveClass(/ring-accent/);
  // push up "max": si scrivono le ripetizioni, la spunta fa partire il recupero
  await expect(push.getByLabel("Push up, serie 1, ripetizioni")).toHaveAttribute("placeholder", "max");
  await push.getByLabel("Push up, serie 1, ripetizioni").fill("17");
  await push.locator(`[data-set="${pushId}:0"]`).getByRole("button", { name: "Segna la serie come fatta" }).click();
  await expect(page.getByRole("timer")).toContainText("Recupero");
  await page.getByRole("button", { name: "Salta" }).click();
  // recupero finito: tocca al vogatore del giro 2
  await expect(page.locator(`[data-set="${vogId}:1"]`)).toHaveClass(/ring-accent/);

  // tutto il circuito in un tocco, poi Annulla e di nuovo
  await page.getByRole("button", { name: /Segna tutto il circuito come fatto/ }).click();
  await expect(page.getByText("Circuito fatto")).toBeVisible();
  await expect(vog.getByRole("button", { name: /250 m/ }).nth(2)).toHaveAttribute("aria-pressed", "true");
  await expect(push.getByRole("button", { name: /Push up: fatto/ })).toBeVisible();
  await page.getByRole("button", { name: "Annulla" }).click();
  await expect(vog.getByRole("button", { name: /250 m/ }).nth(2)).toHaveAttribute("aria-pressed", "false");
  await expect(push.getByLabel("Push up, serie 1, ripetizioni")).toHaveValue("17");
  await page.getByRole("button", { name: /Segna tutto il circuito come fatto/ }).click();
  await expect(page.getByText("Circuito fatto")).toBeVisible();

  // side plank 30" per lato: primo lato, cambio, secondo lato
  const side = page.locator("[data-item]").filter({ hasText: "Side plank" });
  await expect(side.getByLabel(/Un lato alla volta/)).toBeChecked();
  await side.getByRole("button", { name: /Avvia 30" per lato/ }).click();
  await expect(page.getByRole("timer")).toContainText("Si parte · Side plank");
  await expect(page.getByRole("timer")).toContainText("Primo lato", { timeout: 6000 });
  await page.getByRole("button", { name: "Ferma il timer" }).click();
  // chi lo fa a due lati insieme toglie la spunta
  await side.getByLabel(/Un lato alla volta/).uncheck();
  await expect(side.getByRole("button", { name: /^Avvia 30": la serie/ })).toBeVisible();
  await side.getByLabel(/Un lato alla volta/).check();
});

test("corse di qualità: si legge se sono ripetute o fartlek, con riscaldamento e defaticamento", async ({ page }) => {
  await login(page, "nadia@prova.local");
  await page.goto("/cliente/programma");
  await expect(page.locator("h1")).toBeVisible();
  if (!(await page.getByRole("heading", { name: "HYROX · Circuiti", level: 1 }).count())) {
    await page.getByRole("link", { name: /HYROX · Circuiti/ }).click();
  }
  await expect(page.getByRole("heading", { name: "HYROX · Circuiti", level: 1 })).toBeVisible();
  // sul telefono un giorno aperto alla volta: si apre quello che serve
  const open = (card: ReturnType<typeof page.locator>) => card.locator("details").evaluate((d) => void ((d as HTMLDetailsElement).open = true));
  const quality = page.locator("[data-day-card]").filter({ hasText: "Giorno 3 · Corsa di qualità" });
  const long = page.locator("[data-day-card]").filter({ hasText: "Giorno 4 · Lento lungo" });

  await page.getByRole("link", { name: /^Settimana 1/ }).click();
  await expect(page).toHaveURL(/settimana=1/);
  await open(quality);
  await expect(quality.locator("li").getByText("Ripetute", { exact: true })).toBeVisible();
  await expect(quality.getByText("6x400m rec 1'30\"")).toBeVisible();
  await expect(quality.locator('[data-run-step="Riscaldamento"]')).toContainText("10' di corsa blanda");
  await expect(quality.locator('[data-run-step="Defaticamento"]')).toContainText("5' di corsa blanda");
  // il lento lungo è già volume: niente riscaldamento a parte
  await open(long);
  await expect(long.locator("li").getByText("Lento lungo", { exact: true })).toBeVisible();
  await expect(long.locator("[data-run-step]")).toHaveCount(0);

  await page.getByRole("link", { name: /^Settimana 2/ }).click();
  await expect(page).toHaveURL(/settimana=2/);
  await open(quality);
  await expect(quality.locator("li").getByText("Fartlek", { exact: true })).toBeVisible();
  await expect(quality.getByText("20': 1' forte / 1' piano")).toBeVisible();
  await expect(quality.locator('[data-run-step="Riscaldamento"]')).toBeVisible();
});
