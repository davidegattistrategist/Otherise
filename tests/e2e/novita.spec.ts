/** Progetto annuale, dolori nel logbook, domande dell'AI, allenamenti in sequenza. */
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


// le pagine aperte dai test precedenti continuerebbero a segnare come letti i messaggi
test.afterEach(async ({ browser }) => {
  for (const c of browser.contexts()) await c.close().catch(() => undefined);
});

test("progetto annuale: il trainer lo modifica, il cliente lo vede", async ({ page, browser }, info) => {
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Esempio Giulia");
  await page.goto(`/staff/clienti/${id}/progetto`);
  await page.waitForLoadState("networkidle");
  const goal = `Più forza nelle gambe (${info.project.name})`;
  await page.getByLabel(/Obiettivo dell'anno/).fill(goal);
  await page.getByRole("button", { name: /Forza massima, .*Tocca per cambiare/ }).first().click();
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page.getByText(/Progetto salvato/)).toBeVisible();

  const ctx = await browser.newContext(info.project.use);
  const client = await ctx.newPage();
  await login(client, "giulia@prova.local");
  await client.goto("/cliente/profilo");
  await expect(client.getByText("Il tuo progetto")).toBeVisible();
  await expect(client.getByText(goal)).toBeVisible();
  await expect(client.getByText("Volumizzazione").first()).toBeVisible();
  await ctx.close();
});

test("dolore nel logbook: arriva al trainer in Oggi", async ({ page, browser }, info) => {
  const tag = `${info.project.name}-${Date.now() % 100000}`;
  await login(page, "giulia@prova.local");
  await page.goto("/cliente");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/(Prossimo allenamento|Da finire) · settimana \d/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Scegli un altro allenamento/ })).toBeVisible();
  await page.getByText(/Inizia l'allenamento|Riprendi l'allenamento/).first().click();
  await page.waitForURL(/\/cliente\/sessione\//);
  await page.waitForLoadState("networkidle");
  // se un giro precedente ha già scritto un fastidio su questo allenamento, il riquadro è già aperto
  const discomfortBtn = page.getByRole("button", { name: /Hai sentito dolore o fastidio/ });
  await expect(discomfortBtn.or(page.getByLabel("Dolore o fastidio"))).toBeVisible();
  if (await discomfortBtn.isVisible()) await discomfortBtn.click();
  await page.getByLabel("Dolore o fastidio").fill(`Fastidio alla spalla ${tag}`);
  await expect(page.getByText(/Salvato alle/)).toBeVisible({ timeout: 10_000 });

  const ctx = await browser.newContext(info.project.use);
  const owner = await ctx.newPage();
  await login(owner, "titolare@prova.local");
  await owner.goto("/staff");
  await expect(owner.getByText("Dolori e fastidi")).toBeVisible();
  const row = owner.locator("li", { hasText: tag });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Visto" }).click();
  await expect(owner.locator("li", { hasText: tag })).toHaveCount(0);
  await ctx.close();
});

test("l'AI fa qualche domanda prima della bozza", async ({ page }) => {
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Esempio Giulia");
  await page.goto(`/staff/clienti/${id}/programma`);
  await page.waitForLoadState("networkidle");
  await page.locator("a[href^='/staff/programmi/']").filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/programmi\//);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Chiedi all'AI/ }).click();
  await page.locator("#ai-instruction").fill("Aggiungiamo un giorno di corsa facile e teniamo la forza.");
  await page.getByRole("button", { name: "Prepara la bozza" }).click();
  await expect(page.getByText("Prima di preparare la bozza, qualche domanda")).toBeVisible({ timeout: 20_000 });
  // se manca il tempo per seduta, prima lo chiede l'app; poi le domande dell'AI
  if (await page.getByText("Quanto tempo ha a disposizione per ogni seduta?").isVisible()) {
    await page.getByRole("button", { name: "75 minuti" }).click();
    await page.getByRole("button", { name: "Prepara la bozza con queste risposte" }).click();
    await expect(page.getByRole("button", { name: "6:30/km" })).toBeVisible({ timeout: 20_000 });
  }
  await page.getByRole("button", { name: "6:30/km" }).click();
  await page.getByRole("button", { name: "Prepara la bozza con queste risposte" }).click();
  await expect(page.getByText("Cosa ha cambiato l'AI")).toBeVisible({ timeout: 30_000 });
});

test("previsione incassi: solo il titolare, con orizzonte 3/6/12 mesi", async ({ page, browser }, info) => {
  await login(page, "titolare@prova.local");
  await page.goto("/staff/pagamenti");
  await page.getByRole("link", { name: "Previsione dei prossimi mesi" }).click();
  await expect(page.getByRole("heading", { name: "Previsione incassi" })).toBeVisible();
  await expect(page.getByText("Prossimi 30 giorni")).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(6);
  await page.getByRole("link", { name: "12 mesi" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(12);
  // toccando i mesi si vede chi deve pagare: Luca ha un rinnovo in uno dei 12 mesi
  await expect(page.getByText(/Chi deve pagare a /)).toBeVisible();
  const months = page.locator("tbody tr a");
  let found = false;
  for (let i = 0; i < 12 && !found; i++) {
    const href = (await months.nth(i).getAttribute("href"))!;
    await months.nth(i).click();
    await page.waitForURL((u) => href.includes(`mese=${u.searchParams.get("mese")}`));
    await expect(page.locator("#dettaglio").getByText(/Chi deve pagare a /)).toBeVisible();
    found = (await page.locator("#dettaglio").getByText("Prova Luca").count()) > 0;
  }
  expect(found).toBe(true);
  // il collaboratore non ci entra
  const coach = await (await browser.newContext(info.project.use)).newPage();
  await login(coach, "collaboratore@prova.local");
  await coach.goto("/staff/pagamenti/previsione");
  await expect(coach.getByRole("heading", { name: "Previsione incassi" })).toHaveCount(0);
});

/**
 * Senza trascrizione sul server (manca GROQ_API_KEY) la dettatura usa il
 * riconoscimento del browser: lo simuliamo dicendo alla pagina che il server
 * non trascrive. La dettatura normale (registra e trascrive) è in dettatura.spec.ts.
 */
/** Apre l'assistente AI (riprova se il tocco arriva prima che la pagina sia pronta). */
async function openAssistant(page: Page) {
  await expect(async () => {
    await page.getByRole("button", { name: /Chiedi all'AI/ }).click({ timeout: 2000 });
    await expect(page.locator("#ai-instruction")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
}

async function noServerTranscription(page: Page) {
  await page.route("**/api/trascrivi", (r) => (r.request().method() === "GET" ? r.fulfill({ json: { enabled: false } }) : r.continue()));
}

/** Finto riconoscimento vocale del browser: `mode` = "ok" trascrive, "muto" non trascrive mai. */
function fakeSpeech(mode: "ok" | "muto") {
  return (m: string) => {
    class FakeRec {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      timers: ReturnType<typeof setTimeout>[] = [];
      start() {
        if (m !== "ok") return;
        const res = (t: string, isFinal: boolean) => Object.assign([{ transcript: t }], { isFinal });
        this.timers.push(setTimeout(() => this.onresult?.({ resultIndex: 0, results: [res("passiamo a forza", false)] }), 300));
        this.timers.push(setTimeout(() => this.onresult?.({ resultIndex: 0, results: [res("Passiamo a forza per sei settimane.", true)] }), 700));
        this.timers.push(setTimeout(() => this.onresult?.({ resultIndex: 1, results: [res("Passiamo a forza per sei settimane.", true), res("togli lo stacco", false)] }), 1000));
      }
      stop() {
        this.timers.forEach(clearTimeout);
        setTimeout(() => this.onend?.(), 50);
      }
      abort() {
        this.stop();
      }
    }
    const w = window as unknown as { webkitSpeechRecognition: unknown; SpeechRecognition: unknown };
    w.webkitSpeechRecognition = FakeRec;
    w.SpeechRecognition = FakeRec;
  };
}

test("dettatura del browser (senza trascrizione sul server): si vede il testo mentre parli", async ({ page }) => {
  await noServerTranscription(page);
  await page.addInitScript(fakeSpeech("ok"), "ok");
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Esempio Giulia");
  await page.goto(`/staff/clienti/${id}/programma`);
  await page.locator("a[href^='/staff/programmi/']").filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/programmi\//);
  await openAssistant(page);
  await page.getByRole("button", { name: "Detta" }).click();
  await expect(page.locator("#ai-instruction")).toHaveValue("Passiamo a forza per sei settimane.");
  await expect(page.getByText("togli lo stacco…")).toBeVisible();
  // si può mandare anche mentre si detta: il testo provvisorio entra nella richiesta
  await expect(page.getByRole("button", { name: "Prepara la bozza" })).toBeEnabled();
  await page.getByRole("button", { name: /Sto ascoltando/ }).click();
  await expect(page.locator("#ai-instruction")).toHaveValue("Passiamo a forza per sei settimane. togli lo stacco");
});

test("dettatura del browser che non trascrive: si ferma da sola e spiega cosa fare", async ({ page }) => {
  await noServerTranscription(page);
  await page.addInitScript(fakeSpeech("muto"), "muto");
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Esempio Giulia");
  await page.goto(`/staff/clienti/${id}/programma`);
  await page.locator("a[href^='/staff/programmi/']").filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/programmi\//);
  await openAssistant(page);
  await page.getByRole("button", { name: "Detta" }).click();
  await expect(page.getByText(/non sta trascrivendo su questo dispositivo/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Detta" })).toBeVisible();
  // e si può sempre scrivere e mandare
  await page.locator("#ai-instruction").fill("Teniamo la forza.");
  await expect(page.getByRole("button", { name: "Prepara la bozza" })).toBeEnabled();
});

test("su iPhone senza trascrizione sul server: niente Detta, si usa il microfono della tastiera", async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [{ origin: "http://localhost:3000", localStorage: [{ name: "otherise:install-guide", value: "done" }, { name: "otherise:push-prompt", value: "9999999999999" }, { name: "otherise:quote-day", value: "off" }] }] } });
  const page = await ctx.newPage();
  await noServerTranscription(page);
  await page.addInitScript(fakeSpeech("ok"), "ok");
  await login(page, "titolare@prova.local");
  const id = await openClient(page, "Esempio Giulia");
  await page.goto(`/staff/clienti/${id}/programma`);
  await page.locator("a[href^='/staff/programmi/']").filter({ visible: true }).first().click();
  await page.waitForURL(/\/staff\/programmi\//);
  await openAssistant(page);
  await expect(page.getByText("Per dettare tocca la casella e usa il microfono della tastiera.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Detta" })).toHaveCount(0);
  await ctx.close();
});

test("avvisi per email: di serie niente email allo staff, il titolare può cambiarlo", async ({ page }) => {
  await login(page, "titolare@prova.local");
  await page.goto("/staff/impostazioni");
  const card = page.locator("#email");
  const staff = card.locator('input[name="staff_emails"]');
  const clients = card.locator('input[name="client_emails"]');
  await expect(staff).not.toBeChecked();
  await expect(clients).toBeChecked();
  await staff.check();
  await card.getByRole("button", { name: "Salva le email" }).click();
  await expect(card.getByText("Preferenze salvate.")).toBeVisible();
  await page.reload();
  await expect(page.locator('#email input[name="staff_emails"]')).toBeChecked();
  // rimetto com'era
  await page.locator('#email input[name="staff_emails"]').uncheck();
  await page.locator("#email").getByRole("button", { name: "Salva le email" }).click();
  await expect(page.locator("#email").getByText("Preferenze salvate.")).toBeVisible();
});
