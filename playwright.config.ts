/**
 * Test end-to-end nel browser. Richiedono l'app avviata su un database di
 * PROVA con i dati di scripts/seed-demo.ts (mai sul database vero).
 *   E2E_BASE_URL=http://localhost:3000 npx playwright test
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "it-IT",
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : undefined,
  },
  workers: 1,
});
