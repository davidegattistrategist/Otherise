/**
 * Controlli automatici del mattino (regole in src/lib/daily-checks.ts), poi le
 * email delle notifiche nuove.
 * Vercel chiama questo indirizzo con l'intestazione "Authorization: Bearer CRON_SECRET".
 * Sempre alle 8 ora italiana: Vercel ragiona in ora UTC, quindi in vercel.json ci
 * sono due chiamate (6:00 e 7:00 UTC) con `?ora=8` e lavora solo quella che in
 * Italia cade alle 8 (6 UTC con l'ora legale, 7 UTC con l'ora solare). Senza
 * `ora` (chiamata a mano) lavora sempre.
 */
import { NextResponse, type NextRequest } from "next/server";
import { runDailyChecks } from "@/lib/daily-checks";
import { romeHour } from "@/lib/dates";

export const dynamic = "force-dynamic";
// con decine di clienti le notifiche, le email e le pulizie possono superare il minuto
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const hour = req.nextUrl.searchParams.get("ora");
  if (hour !== null && romeHour() !== Number(hour)) {
    return NextResponse.json({ ok: true, skipped: `in Italia non sono le ${hour}` });
  }
  const result = await runDailyChecks();
  return NextResponse.json(result);
}
