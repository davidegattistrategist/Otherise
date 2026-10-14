/**
 * Test end-to-end nel browser, da computer e da telefono. Richiedono l'app
 * avviata su un database di PROVA con i dati di scripts/seed-demo.ts (mai sul database vero).
 *   E2E_BASE_URL=http://localhost:3000 npx playwright test
 */
import { defineConfig, devices } from "@playwright/test";

const launchOptions = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : undefined;
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
// la guida "Metti l'app sulla Home", l'invito alle notifiche e la frase del giorno risultano già visti
// (hanno i loro test in installazione.spec.ts, che li riaccende)
const storageState = {
  cookies: [],
  origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: "otherise:install-guide", value: "done" }, { name: "otherise:push-prompt", value: "9999999999999" }, { name: "otherise:quote-day", value: "off" }, { name: "otherise:push-popup", value: "9999999999999" }, { name: "otherise:days-open", value: "all" }] }],
};

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    storageState,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    launchOptions,
  },
  projects: [
    { name: "pc", use: { viewport: { width: 1360, height: 900 } } },
    { name: "telefono", use: { ...devices["Pixel 7"], browserName: "chromium", locale: "it-IT", launchOptions, storageState } },
  ],
});
