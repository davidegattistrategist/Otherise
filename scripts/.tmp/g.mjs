import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ls = [{ name: "otherise:install-guide", value: "done" }, { name: "otherise:push-popup", value: "9999999999999" }, { name: "otherise:quote-day", value: "off" }];
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, baseURL: "http://localhost:3000", storageState: { cookies: [], origins: [{ origin: "http://localhost:3000", localStorage: ls }] } });
const p = await ctx.newPage();
await p.goto("/login");
await p.fill("input[name=email]", "titolare@prova.local");
await p.fill("input[name=password]", "Password-di-prova-123");
await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.getByRole("button", { name: "Entra" }).click()]);
const id = process.argv[2];
await p.goto(`/staff/clienti/${id}/profilo`);
const t = p.locator("textarea[name=goals]");
await t.fill("NUOVO");
for (let i = 0; i < 8; i++) { await p.waitForTimeout(500); console.log(i, JSON.stringify(await t.inputValue()), await p.locator("[data-live-status]").first().getAttribute("data-live-status")); }
await b.close();
