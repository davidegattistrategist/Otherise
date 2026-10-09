/**
 * Controlli automatici, una volta al giorno (Vercel Cron, vedi vercel.json):
 * - pagamenti in scadenza o scaduti → avviso al titolare e al cliente
 * - programmi che finiscono entro 7 giorni → avviso a chi segue il cliente
 * - check-up settimanale → promemoria al cliente il venerdì e la domenica
 * Poi manda per email le notifiche nuove.
 * Vercel chiama questo indirizzo con l'intestazione "Authorization: Bearer CRON_SECRET".
 */
import { NextResponse, type NextRequest } from "next/server";
import { runDailyChecks } from "@/lib/daily-checks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const result = await runDailyChecks();
  return NextResponse.json(result);
}
