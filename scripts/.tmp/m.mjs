import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ls = [{ name: "otherise:install-guide", value: "done" }, { name: "otherise:push-popup", value: "9999999999999" }, { name: "otherise:quote-day", value: "off" }];
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, baseURL: "http://localhost:3000", storageState: { cookies: [], origins: [{ origin: "http://localhost:3000", localStorage: ls }] } });
const p = await ctx.newPage();
await p.goto("/login");
await p.fill("input[name=email]", "titolare@prova.local");
await p.fill("input[name=password]", "Password-di-prova-123");
await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.getByRole("button", { name: "Entra" }).click()]);
const [g, ex, pos] = process.argv.slice(2);
const pages = [`/staff/clienti/${g}/profilo`, "/staff/impostazioni", `/staff/clienti/${g}/programma`, "/staff/team", `/staff/eserciziario/${ex}`, `/staff/clienti/${g}/posturale?modifica=${pos}`, `/staff/clienti/${g}/sessioni`, `/staff/clienti/${g}/pagamenti`];
for (const u of pages) {
  await p.goto(u);
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(2500);
  const st = await p.locator("[data-live-status]").evaluateAll((els) => els.map((e) => e.getAttribute("data-live-status")));
  console.log(u.replace(g, "G"), st.join(","));
}
await b.close();
