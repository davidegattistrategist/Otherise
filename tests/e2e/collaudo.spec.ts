/**
 * Collaudo completo, da computer e da telefono (vedi playwright.config.ts).
 * Richiede l'app avviata su un database di PROVA con i dati di scripts/seed-demo.ts.
 * Ogni test crea dati con un nome unico, così i due giri (pc e telefono) non si pestano i piedi.
 */
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const PASS = "Password-di-prova-123";
const FIX = path.join(__dirname, "fixtures");

async function login(page: Page, email: string) {
  page.on("dialog", (d) => void d.accept());
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASS);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.getByRole("button", { name: "Entra" }).click()]);
  return errors;
}

function noHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
}

async function openClient(page: Page, name: string) {
  await page.goto("/staff/clienti");
  await page.locator('a[href^="/staff/clienti/"]', { hasText: name }).filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}$/);
  return page.url();
}

test.describe("titolare", () => {
  test("cliente nuovo: scheda, check, posturale, sessioni, pagamenti", async ({ page }, info) => {
    const errors = await login(page, "titolare@prova.local");
    const tag = info.project.name;
    const first = `Prova${tag}`;
    // nuovo cliente
    await page.goto("/staff/clienti/nuovo");
    await page.fill("input[name=first_name]", first);
    await page.fill("input[name=last_name]", "Collaudo");
    await page.selectOption("select[name=sex]", "M");
    await page.fill("input[name=birth_date]", "1990-03-15");
    await page.fill("textarea[name=goals]", "Più forza");
    await page.getByRole("button", { name: "Crea cliente" }).click();
    await page.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}$/);
    const base = page.url();
    await expect(page.getByRole("heading", { name: `${first} Collaudo` })).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);

    // check con 7 pliche: percentuale calcolata mentre si scrive
    await page.goto(`${base}/check/nuovo`);
    await page.waitForLoadState("networkidle");
    await page.fill("input[name=weight_kg]", "80");
    for (const site of ["tricipite", "pettorale", "ascellare", "sottoscapolare", "soprailiaca", "addominale", "coscia"]) {
      await page.fill(`input[name=sf_${site}_0]`, "14");
    }
    await expect(page.getByText(/%/).first()).toBeVisible();
    await page.getByRole("button", { name: "Salva check" }).click();
    await expect(page.getByText("Check salvato.")).toBeVisible();
    // l'avviso resta, ma l'indirizzo viene ripulito: ricaricando non ricompare
    await expect(page).toHaveURL(/\/check$/);
    await expect(page.getByText(/Grasso \d/)).toBeVisible();

    // check senza coscia e ascellare: si usa la formula a 3 pliche e lo dice
    await page.goto(`${base}/check/nuovo`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("l'ultima volta non presa")).toHaveCount(0);
    for (const site of ["tricipite", "pettorale", "sottoscapolare", "soprailiaca", "addominale"]) {
      await page.fill(`input[name=sf_${site}_0]`, "13");
    }
    await expect(page.getByText(/Manca ascellare, coscia: al salvataggio tutti i check/)).toBeVisible();
    await page.getByRole("button", { name: "Salva check" }).click();
    await expect(page.getByText("Check salvato.")).toBeVisible();
    await expect(page.getByText(/Ora: 3 pliche \(petto, tricipite, sottoscapolare\), scelta in automatico/)).toBeVisible();
    await expect(page.getByText("Pliche non prese: ascellare, coscia")).toBeVisible();
    await page.goto(`${base}/check/nuovo`);
    await expect(page.getByText("l'ultima volta non presa").filter({ visible: true })).toHaveCount(2);

    // posturale
    await page.goto(`${base}/posturale`);
    await page.fill("textarea[name=tight_muscles]", "Psoas rigido");
    await page.getByRole("button", { name: "Salva la valutazione" }).click();
    await expect(page.getByText("Valutazione salvata.")).toBeVisible();
    await expect(page.getByText("Psoas rigido")).toBeVisible();

    // sessione PT
    await page.goto(`${base}/sessioni`);
    await page.fill("textarea[name=notes]", "Prima sessione di collaudo");
    await page.getByRole("button", { name: "Salva la sessione" }).click();
    await expect(page.getByText("Sessione salvata.")).toBeVisible();
    await expect(page.getByText("Prima sessione di collaudo").last()).toBeVisible();

    // pagamenti: pacchetto da 10, pagamento, la sessione scala
    await page.goto(`${base}/pagamenti`);
    await page.waitForLoadState("networkidle");
    await page.selectOption("select[name=kind]", "package");
    await page.fill("input[name=amount]", "400");
    await page.getByRole("button", { name: "Attiva il piano" }).click();
    await expect(page.getByText("Piano salvato.")).toBeVisible();
    await expect(page).toHaveURL(/\/pagamenti$/);
    await page.getByRole("button", { name: "Registra il pagamento" }).click();
    await expect(page.getByText(/Pagamento di .* registrato/)).toBeVisible();
    // il vecchio avviso del piano non resta sullo schermo
    await expect(page.getByText("Piano salvato.")).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(/9 sessioni rimaste/).first()).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);

    // programma vuoto → esercizi, blocchi, copia settimana, pubblica
    await page.goto(`${base}/programma`);
    await page.getByRole("button", { name: "Programma vuoto" }).click();
    await page.waitForURL(/\/staff\/programmi\//);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Esercizio", exact: true }).first().click();
    const name = page.getByLabel("Esercizio", { exact: true }).filter({ visible: true }).first();
    await name.fill("Panca piana");
    await page.getByLabel("Panca piana, settimana 1").filter({ visible: true }).fill("4x8 60kg");
    if (info.project.name === "pc") await page.getByRole("button", { name: /Copia la settimana 1/ }).first().click();
    else await page.getByLabel("Panca piana, settimana 1").filter({ visible: true }).fill("4x8 60kg");
    if (info.project.name === "pc") await expect(page.getByLabel("Panca piana, settimana 3").filter({ visible: true })).toHaveValue("4x8 60kg");
    await page.getByRole("button", { name: "AMRAP" }).first().click();
    await page.getByRole("button", { name: "Testo libero" }).first().click();
    await page.fill("#start", "2026-10-12");
    await page.getByRole("button", { name: "Salva", exact: true }).click();
    await expect(page.getByText(/Salvato alle/)).toBeVisible();
    await page.getByRole("button", { name: "Pubblica" }).click();
    await expect(page.getByText(/Pubblicato/).first()).toBeVisible();

    // importa un foglio Google come storico
    await page.goto(`${base}/programma`);
    await page.setInputFiles("input[type=file][name=file]", path.join(FIX, "scheda.csv"));
    await page.fill("form input[name=title]", "Fase importata");
    await page.getByRole("button", { name: "Importa", exact: true }).click();
    await page.waitForURL(/\/staff\/programmi\//);
    await page.waitForLoadState("networkidle");
    if (info.project.name === "pc") await expect(page.getByLabel("Squat con bilanciere, settimana 2").filter({ visible: true })).toHaveValue("5x6 80kg");
    else await expect(page.getByLabel("Squat con bilanciere, settimana 1").filter({ visible: true })).toHaveValue("5x5 80kg");

    // panoramica
    await page.goto(base);
    await expect(page.getByText("Programma in corso").or(page.getByText("Nessun programma pubblicato"))).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("nuova fase con l'AI, modello, eserciziario", async ({ page }, info) => {
    const errors = await login(page, "titolare@prova.local");
    const base = await openClient(page, "Esempio Giulia");
    await page.goto(`${base}/programma`);
    await page.getByRole("button", { name: "Crea la nuova fase" }).click();
    await page.waitForURL(/\/staff\/programmi\//);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /Chiedi all.AI/ }).click();
    await page.fill("#ai-instruction", "Più volume sui fondamentali");
    await page.getByRole("button", { name: "Prepara la bozza" }).click();
    // se il cliente non ha ancora un tempo per seduta, l'app lo chiede prima della bozza
    const timeQ = page.getByText("Quanto tempo ha a disposizione per ogni seduta?");
    const done = page.getByText("Cosa ha cambiato l'AI");
    await expect(timeQ.or(done)).toBeVisible({ timeout: 30_000 });
    if (await timeQ.isVisible()) {
      await page.getByRole("button", { name: "60 minuti" }).click();
      await page.getByRole("button", { name: "Prepara la bozza con queste risposte" }).click();
    }
    await expect(done).toBeVisible({ timeout: 30_000 });
    // il tempo scelto finisce nel programma e la stima per giornata compare
    await expect(page.getByLabel(/Tempo per seduta/)).toHaveValue("60");
    await expect(page.getByTestId("day-minutes").first()).toBeVisible();
    // il trainer corregge una riga della bozza e pubblica: l'AI ne ricava una lezione
    const cell = page.getByLabel(/, settimana 1$/).filter({ visible: true }).nth(1);
    await cell.fill("3x10/14");
    await page.getByRole("button", { name: "Salva", exact: true }).click();
    await expect(page.getByText(/Salvato alle/)).toBeVisible();
    await page.getByRole("button", { name: "Pubblica", exact: true }).click();
    await expect(page.getByText(/Pubblicato/).first()).toBeVisible();
    // salva come modello
    await page.getByRole("button", { name: "Salva come modello" }).click();
    await page.fill("#tpl-title", `Modello ${info.project.name}`);
    await page.getByRole("button", { name: "Salva modello" }).click();
    await expect(page.getByText("Salvato tra i modelli.")).toBeVisible();
    await page.goto("/staff/modelli");
    await expect(page.getByText(`Modello ${info.project.name}`)).toBeVisible();

    // indicazioni per l'AI: il tempo detto all'AI è diventato il riferimento del cliente
    await page.goto(`${base}/programma`);
    await expect(page.getByText("Indicazioni per l'AI", { exact: true })).toBeVisible();
    await expect(page.locator("#ai-minutes")).toHaveValue("60");
    await expect(page.getByTestId("program-balance")).toBeVisible();
    await page.selectOption("#ai-strength", "intermedio");
    await page.getByLabel("Segui il programma").uncheck();
    await page.getByRole("button", { name: "Salva le indicazioni" }).click();
    await expect(page.getByText("Indicazioni salvate")).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);

    // impostazioni: le correzioni sono contate e diventate lezioni
    await page.goto("/staff/impostazioni");
    await expect(page.getByTestId("ai-trend")).toBeVisible();
    await expect
      .poll(async () => {
        await page.reload();
        return page.locator("#ai_lessons").inputValue();
      }, { timeout: 20_000 })
      .toMatch(/range larghi/);

    // eserciziario: nuovo, cerca, import csv
    await page.goto("/staff/eserciziario/nuovo");
    await page.fill("input[name=name]", `Esercizio ${info.project.name}`);
    await page.fill("input[name=video_url]", "https://youtu.be/abcdefghijk");
    await page.getByRole("button", { name: "Salva" }).click();
    await page.waitForURL(/eserciziario\/[0-9a-f-]{36}/);
    await page.goto(`/staff/eserciziario?q=${encodeURIComponent(`Esercizio ${info.project.name}`)}`);
    await expect(page.getByText(`Esercizio ${info.project.name}`)).toBeVisible();
    await page.goto("/staff/eserciziario");
    await page.setInputFiles("input[type=file][name=file]", path.join(FIX, "eserciziario.csv"));
    await page.getByRole("button", { name: "Importa file" }).click();
    await expect(page.getByText(/importat|aggiunt|già/i).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("pagine generali e impostazioni", async ({ page }) => {
    const errors = await login(page, "titolare@prova.local");
    for (const p of ["/staff", "/staff/clienti", "/staff/pagamenti", "/staff/notifiche", "/staff/team", "/staff/impostazioni", "/staff/modelli", "/staff/eserciziario"]) {
      await page.goto(p);
      await expect(page.locator("h1").first()).toBeVisible();
      expect(await noHorizontalScroll(page), p).toBe(true);
    }
    await page.goto("/staff/impostazioni");
    await page.fill("input[name=reminder_days]", "5");
    await page.getByRole("button", { name: "Salva", exact: true }).click();
    await expect(page.getByText("Impostazioni salvate.")).toBeVisible();
    await page.goto("/staff/clienti?q=Giulia");
    await expect(page.getByRole("link", { name: /Esempio Giulia/ }).filter({ visible: true }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("collaboratore", () => {
  test("vede solo i suoi clienti e niente pagamenti", async ({ page }) => {
    const errors = await login(page, "collaboratore@prova.local");
    await page.goto("/staff/clienti");
    await expect(page.getByRole("link", { name: /Prova Luca/ }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Esempio Giulia" })).toHaveCount(0);
    await page.goto("/staff/pagamenti");
    await expect(page.getByText("Quella pagina la vede solo il titolare")).toBeVisible();
    await expect(page).toHaveURL(/\/staff$/);
    const base = await openClient(page, "Prova Luca");
    await expect(page.getByRole("link", { name: "Pagamenti" })).toHaveCount(0);
    await page.goto(`${base}/sessioni`);
    await page.fill("textarea[name=notes]", "Nota del collaboratore");
    await page.getByRole("button", { name: "Salva la sessione" }).click();
    await expect(page.getByText("Sessione salvata.")).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("cliente", () => {
  test("allenamento, progressi, diario, percorso", async ({ page }, info) => {
    const kgValue = info.project.name === "pc" ? "61" : "62";
    const errors = await login(page, "giulia@prova.local");
    await expect(page.getByRole("heading", { name: "Ciao Giulia" })).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    // programma: cambio settimana
    await page.goto("/cliente/programma");
    await page.getByRole("link", { name: /^Settimana 1/ }).click();
    await expect(page).toHaveURL(/settimana=1/);
    await expect(page.getByText(/Fatto il/).first()).toBeVisible();
    // logbook: riapro una sessione fatta e la correggo
    await page.getByRole("link", { name: "Rivedi o correggi il logbook" }).first().click();
    await page.waitForURL(/\/cliente\/sessione\//);
    await page.waitForLoadState("networkidle");
    const kg = page.locator('input[aria-label$="serie 1, chili"]').first();
    await kg.fill(kgValue);
    await expect(page.getByText(/Salvato alle/)).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(page.locator('input[aria-label$="serie 1, chili"]').first()).toHaveValue(kgValue);
    expect(await noHorizontalScroll(page)).toBe(true);
    // un allenamento nuovo fino a "Ho finito"
    await page.goto("/cliente");
    const start = page.getByRole("link", { name: /Inizia l'allenamento|Riprendi l'allenamento/ });
    if (await start.count()) {
      await start.click();
      await page.waitForURL(/\/cliente\/sessione\//);
      await page.waitForLoadState("networkidle");
      // un tocco prima che la pagina sia pronta non fa nulla: riprova finché salva
      const check = page.locator('button[aria-label="Segna la serie come fatta"]').filter({ visible: true });
      await expect(async () => {
        if (await check.count()) await check.first().click();
        else await page.locator("main input").filter({ visible: true }).first().fill(`Fatto tutto ${Date.now()}`);
        await expect(page.getByText(/Salvato alle/)).toBeVisible({ timeout: 3_000 });
      }).toPass({ timeout: 20_000 });
      await page.getByRole("button", { name: "Ho finito" }).click();
      // le serie non spuntate: prima di chiudere chiede se sono state fatte
      const ask = page.getByRole("dialog", { name: "Serie non spuntate" });
      await expect(ask.or(page.getByText("Allenamento registrato"))).toBeVisible();
      if (await ask.isVisible()) {
        await expect(ask.getByRole("listitem").first()).toBeVisible();
        await ask.getByRole("button", { name: "Le ho fatte: segnale come fatte" }).click();
      }
      await expect(page.getByText("Allenamento registrato")).toBeVisible();
    }
    // progressi, percorso, notifiche
    for (const p of ["/cliente/progressi", "/cliente/profilo", "/cliente/notifiche", "/cliente/diario"]) {
      await page.goto(p);
      await expect(page.locator("h1").first()).toBeVisible();
      expect(await noHorizontalScroll(page), p).toBe(true);
    }
    // l'area staff non è accessibile
    await page.goto("/staff");
    await expect(page).toHaveURL(/\/cliente/);
    expect(errors).toEqual([]);
  });
});
