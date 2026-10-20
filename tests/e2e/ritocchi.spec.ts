/**
 * Programma in corso (Fase 2 di Giulia nel seed: settimane 1-2 fatte, la 3 a metà):
 * - settimane fatte bloccate, "Sblocca per correggere";
 * - limitazione temporanea nelle indicazioni per l'AI (si vede nell'editor e l'AI la riceve);
 * - "Sostituisci per alcune settimane": il cliente vede "Al posto di …";
 * - "Ritocca con l'AI": pezzo, settimane solo dopo le fatte, motivo, Prima → Dopo
 *   con le caselle, Applica, Annulla il ritocco;
 * - salvataggio di un programma in corso: finestra "Avvisare il cliente?";
 * - "Ritocchi": si torna com'era prima.
 * Alla fine il programma torna come nel seed (il test gira su pc e telefono).
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const PASS = "Password-di-prova-123";

async function login(page: Page, email: string) {
  page.on("dialog", (d) => void d.accept());
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASS);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.getByRole("button", { name: "Entra" }).click()]);
}

async function openGiuliaProgram(page: Page) {
  await page.goto("/staff/clienti");
  await page.waitForLoadState("networkidle");
  await page.locator('a[href^="/staff/clienti/"]', { hasText: "Esempio Giulia" }).filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/clienti\/[0-9a-f-]{36}/);
  const clientId = /\/staff\/clienti\/([0-9a-f-]{36})/.exec(page.url())![1];
  await page.goto(`/staff/clienti/${clientId}/programma`);
  await page.getByRole("link", { name: /Fase 2 · Volume/ }).filter({ hasText: "In corso" }).first().click();
  await page.waitForURL(/\/staff\/programmi\/[0-9a-f-]{36}/);
  await page.waitForLoadState("networkidle");
  return { clientId, url: page.url().split("?")[0] };
}

const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true }).first();

/** Salva e risponde alla finestra "Avvisare il cliente?" */
async function save(page: Page, notify: boolean) {
  await page.getByRole("button", { name: /^(Salva|Salva le modifiche)$/ }).filter({ visible: true }).first().click();
  const ask = page.getByRole("dialog", { name: "Avvisare il cliente?" });
  await expect(ask).toBeVisible({ timeout: 15_000 });
  await expect(ask).toContainText("Avvisare Giulia");
  await ask.getByRole("button", { name: notify ? "Sì, manda la notifica" : "No, non serve" }).click();
  await expect(ask).toHaveCount(0);
  await expect(page.getByText(/Salvato alle/).filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });
}

/** Su telefono una settimana alla volta: sceglie la scheda della settimana */
async function showWeek(page: Page, week: number) {
  const tab = page.getByRole("tab", { name: new RegExp(`^Settimana ${week}( \\(fatta\\))?$`) }).filter({ visible: true }).first();
  if (await tab.count()) await tab.click();
}

test("programma in corso: settimane fatte, limitazione, sostituto, ritocco con l'AI, avviso al cliente e ritocchi", async ({ page, browser }, info) => {
  test.setTimeout(180_000);
  await login(page, "titolare@prova.local");
  const { clientId, url } = await openGiuliaProgram(page);

  // ---- settimane fatte: bloccate, si sbloccano solo apposta
  const locked = page.locator("[data-locked-weeks]");
  await expect(locked).toContainText(/Le settimane 1–\d sono fatte/);
  const through = Number(/1–(\d)/.exec(await locked.innerText())![1]);
  expect(through).toBeGreaterThanOrEqual(2);
  expect(through).toBeLessThan(4);
  const open = through + 1;
  await showWeek(page, 1);
  const done1 = visible(page, '[aria-label="Hollow hold, settimana 1 (fatta)"]');
  await expect(done1).toHaveJSProperty("readOnly", true);
  await locked.locator("[data-unlock-weeks]").click();
  await expect(locked).toHaveCount(0);
  await expect(page.getByText("Settimane fatte sbloccate")).toBeVisible();
  await expect(visible(page, '[aria-label="Hollow hold, settimana 1"]')).toHaveJSProperty("readOnly", false);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.locator("[data-locked-weeks]")).toBeVisible();

  // ---- limitazione temporanea nelle indicazioni per l'AI
  await page.goto(`/staff/clienti/${clientId}/programma`);
  await page.waitForLoadState("networkidle");
  const limitation = `Distorsione al polso sinistro ${info.project.name}`;
  await page.locator("#ai-limitation").fill(limitation);
  await page.locator("#ai-limitation-until").fill("2030-12-31");
  await page.getByRole("button", { name: "Salva le indicazioni" }).click();
  await expect(page.getByText("Indicazioni salvate")).toBeVisible();
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("[data-limitation-note]")).toContainText(limitation);

  // ---- sostituto per alcune settimane
  const hollow = visible(page, '[data-ex-name="Hollow hold"]');
  await hollow.locator("[data-swap-add]").click();
  const form = hollow.locator("[data-swap-form]");
  await form.getByLabel("Esercizio sostitutivo").fill("Dead bug");
  await expect(form.getByLabel("Sostituisci dalla settimana").locator("option")).toHaveCount(4 - through);
  await form.getByLabel("Perché (facoltativo)").fill("schiena");
  await form.locator("[data-swap-save]").click();
  await expect(hollow.locator("[data-swap]")).toContainText("Dead bug");
  await expect(hollow.locator("[data-swap]")).toContainText(`settiman`);
  await showWeek(page, open);
  await expect(visible(page, "[data-swap-cell]")).toContainText("Dead bug");
  await save(page, false);

  const client = await (await browser.newContext(info.project.use)).newPage();
  await login(client, "giulia@prova.local");
  await client.goto(`/cliente/programma?settimana=${open}`);
  const day2 = client.locator("[data-day-card]").filter({ hasText: "Giorno 2 · Tirata e core" }).first();
  const det = day2.locator("details");
  if (!(await det.evaluate((e) => (e as HTMLDetailsElement).open))) await det.locator("summary").click();
  await expect(day2.locator("[data-swapped]")).toContainText("Al posto di Hollow hold");
  await expect(day2).toContainText("Dead bug");
  // nelle settimane già fatte resta l'esercizio di prima
  await client.goto("/cliente/programma?settimana=1");
  const day2w1 = client.locator("[data-day-card]").filter({ hasText: "Giorno 2 · Tirata e core" }).first();
  const det1 = day2w1.locator("details");
  if (!(await det1.evaluate((e) => (e as HTMLDetailsElement).open))) await det1.locator("summary").click();
  await expect(day2w1).toContainText("Hollow hold");
  await expect(day2w1.locator("[data-swapped]")).toHaveCount(0);

  // ---- ritocco con l'AI di un esercizio
  const step = visible(page, '[data-ex-name="Box step-up"]');
  await step.locator("[data-retouch-item-open]").click();
  const panel = page.getByRole("dialog", { name: "Ritocca da qui" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("radio", { name: /Box step-up/ })).toBeChecked();
  // le settimane fatte non si possono scegliere
  await expect(panel.getByLabel("Dalla settimana").locator("option")).toHaveCount(4 - through);
  await expect(panel).toContainText(`Le settimane 1–${through} sono fatte`);
  await panel.getByRole("button", { name: "Proponi le modifiche" }).click();
  await expect(panel.getByRole("alert")).toContainText("Scegli o scrivi il motivo");
  await panel.getByRole("button", { name: "Troppo facile" }).click();
  await expect(panel.getByLabel("Motivo del ritocco")).toHaveValue("Troppo facile.");
  await panel.getByRole("button", { name: "Proponi le modifiche" }).click();
  const review = panel.locator("[data-retouch-review]");
  await expect(review).toBeVisible({ timeout: 30_000 });
  await expect(review.locator("[data-retouch-row]")).toHaveCount(4 - through + 1);
  await expect(review).toContainText(`Settimana ${open}`);
  await expect(review).toContainText("4x10 70kg");
  // l'AI ha ricevuto le settimane fatte, cosa ha fatto davvero e la limitazione
  const sent = readFileSync("/tmp/claude-0/mock-retouch-last.txt", "utf8");
  expect(sent).toContain(`Le settimane da 1 a ${through} sono già fatte`);
  expect(sent).toContain("Box step-up");
  expect(sent).toContain(`LIMITAZIONE TEMPORANEA fino al 2030-12-31: ${limitation}`);
  // tolgo le indicazioni, tengo le prescrizioni
  await review.locator('[data-retouch-row$=":notes"]').uncheck();
  await panel.locator("[data-retouch-apply]").click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator("[data-retouch-done]")).toBeVisible();
  await showWeek(page, open);
  const cell = visible(page, `[aria-label="Box step-up, settimana ${open}"]`);
  await expect(cell).toHaveValue("4x10 70kg");
  // Annulla il ritocco: tutto come prima
  await page.locator("[data-retouch-undo]").click();
  await expect(cell).toHaveValue("10");
  await expect(page.locator("[data-retouch-done]")).toHaveCount(0);

  // di nuovo, questa volta dal giorno, e salvo con la notifica
  await visible(page, "[data-retouch-day]").click();
  await expect(panel.getByRole("radio", { name: "Un giorno" })).toBeChecked();
  await panel.getByLabel("Giorno da ritoccare").selectOption({ label: "Giorno 2 · Tirata e core" });
  await panel.getByLabel("Motivo del ritocco").fill("Troppo facile: ha chiuso tutto con margine");
  await panel.getByRole("button", { name: "Proponi le modifiche" }).click();
  await expect(review).toBeVisible({ timeout: 30_000 });
  await panel.locator("[data-retouch-apply]").click();
  await expect(page.locator("[data-retouch-done]")).toBeVisible();
  await save(page, true);
  await expect(client.locator("body")).toBeVisible();
  await client.goto("/cliente/notifiche");
  await expect(client.getByText("Il tuo programma è stato aggiornato").first()).toBeVisible();

  // ---- Ritocchi: torno com'era prima del ritocco, poi tolgo il sostituto
  await page.reload();
  await page.waitForLoadState("networkidle");
  const revs = page.locator("[data-revisions]");
  await revs.locator("summary").click();
  await expect(revs.locator("li").first()).toContainText("Ritocco con l'AI: Troppo facile");
  await revs.locator("[data-restore-revision]").first().click();
  await expect(page.getByText(/Rimessa la versione di prima/)).toBeVisible();
  await showWeek(page, open);
  const anyChanged = await page.locator('[aria-label^="Stacco rumeno, settimana"], [aria-label^="Box step-up, settimana"]').evaluateAll((els) => els.some((e) => (e as HTMLTextAreaElement).value.startsWith("4x10 7")));
  expect(anyChanged).toBe(false);
  // il sostituto c'era già prima del ritocco: resta finché non lo tolgo
  await expect(visible(page, '[data-ex-name="Hollow hold"]').locator("[data-swap]")).toContainText("Dead bug");
  await visible(page, '[data-ex-name="Hollow hold"]').getByRole("button", { name: "Togli la sostituzione Dead bug" }).click();
  await expect(visible(page, '[data-ex-name="Hollow hold"]').locator("[data-swap]")).toHaveCount(0);
  await save(page, false);

  // la limitazione si toglie
  await page.goto(`/staff/clienti/${clientId}/programma`);
  await page.waitForLoadState("networkidle");
  await page.locator("#ai-limitation").fill("");
  await page.locator("#ai-limitation-until").fill("");
  await page.getByRole("button", { name: "Salva le indicazioni" }).click();
  await expect(page.getByText("Indicazioni salvate")).toBeVisible();
  await page.goto(url);
  await expect(page.locator("[data-limitation-note]")).toHaveCount(0);
  await client.context().close();
});

test("il cliente apre la card dell'allenamento e vede gli esercizi senza farlo partire", async ({ page }) => {
  await login(page, "giulia@prova.local");
  await page.goto("/cliente");
  const preview = page.locator("[data-next-preview]");
  await expect(preview).toBeVisible();
  const body = preview.locator("> div");
  await expect(body).toBeHidden();
  await preview.locator("summary").click();
  await expect(body).toBeVisible();
  await expect(preview.getByText("Chiudi gli esercizi")).toBeVisible();
  // dentro c'è il giorno con le prescrizioni della settimana
  await expect(body.locator("li").first()).toBeVisible();
  await expect(page).toHaveURL(/\/cliente$/);
  // il pulsante per partire resta lì sotto
  await expect(page.getByRole("link", { name: /Inizia l'allenamento|Riprendi l'allenamento/ })).toBeVisible();
  await preview.locator("summary").click();
  await expect(body).toBeHidden();
});
