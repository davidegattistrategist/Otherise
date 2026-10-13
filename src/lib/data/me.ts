import "server-only";
import { cache } from "react";
import { createClient } from "../supabase/server";
import { formatLong, todayISO } from "../dates";

/** "17 ottobre" (con l'anno solo se non è quello in corso) */
const dayMonth = (d: string) => (d.slice(0, 4) === todayISO().slice(0, 4) ? formatLong(d).replace(/ \d{4}$/, "") : formatLong(d));
import { billingStatus, clientFacingStatus, withUnpaidRows, type BillingRow, type BillingStatus, type PlanKind } from "../billing";
import { clientNotices, ptLeft, type ClientNotice } from "../client-notice";
import { getClientCredit } from "./billing";
import { parseContent, type ProgramContent } from "../program/types";
import { displayWeek, weekPosition, type WeekPosition } from "../program/schedule";
import { computeRecords } from "../strength/records";

export type MyProgram = {
  id: string;
  title: string;
  description: string;
  weeks: number;
  session_minutes: number | null;
  start_date: string;
  status: string;
  content: ProgramContent;
  week: number;
  position: WeekPosition;
};

/** Il programma da mostrare al cliente: quello iniziato più di recente, altrimenti il prossimo in partenza. */
export const getMyPrograms = cache(async (clientId: string) => {
  const supabase = await createClient();
  const today = todayISO();
  const { data } = await supabase
    .from("programs")
    .select("id, title, description, weeks, session_minutes, start_date, status, content")
    .eq("client_id", clientId)
    .in("status", ["published", "archived"])
    .order("start_date", { ascending: false });
  const all = (data ?? []).filter((p) => p.start_date);
  const published = all.filter((p) => p.status === "published");
  const started = published.filter((p) => p.start_date! <= today);
  const raw = started[0] ?? published[published.length - 1] ?? null;
  const toProgram = (p: NonNullable<typeof raw>): MyProgram => ({
    ...p,
    start_date: p.start_date!,
    content: parseContent(p.content),
    week: displayWeek(p.start_date, p.weeks, today),
    position: weekPosition(p.start_date!, p.weeks, today),
  });
  const current = raw ? toProgram(raw) : null;
  // un programma pubblicato che parte dopo quello in corso
  const upcoming = published.filter((p) => p.start_date! > today && p.id !== raw?.id).map(toProgram).pop() ?? null;
  const past = all.filter((p) => p.id !== raw?.id && p.id !== upcoming?.id).map(toProgram);
  return { current, upcoming, past };
});

export async function getMyLogs(programId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("workout_logs").select("id, week, day_id, completed, performed_on").eq("program_id", programId);
  return data ?? [];
}

/** Video degli esercizi, per id e per nome (minuscolo). */
export const getVideoMap = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("exercises").select("id, name, video_url").not("video_url", "is", null);
  const map: Record<string, string> = {};
  for (const e of data ?? []) {
    if (!e.video_url) continue;
    map[e.id] = e.video_url;
    map[e.name.trim().toLowerCase()] = e.video_url;
  }
  return map;
});

/** Massimali del cliente collegato (test dei check, altrimenti stima dal logbook), per le prescrizioni in %. */
export const getMyMaxes = cache(async (clientId: string) => {
  const supabase = await createClient();
  const [{ data: logs }, { data: checks }] = await Promise.all([
    supabase.from("exercise_logs").select("exercise_name, performed_on, sets").eq("client_id", clientId).order("performed_on", { ascending: false }).limit(1500),
    supabase.rpc("my_checks"),
  ]);
  const maxes: Record<string, number> = {};
  for (const [k, r] of computeRecords(logs ?? [])) if (r.e1rm) maxes[k] = r.e1rm;
  for (const c of checks ?? []) {
    for (const t of (c.strength_tests as Array<{ exercise?: string; e1rm?: number | null }> | null) ?? []) {
      if (t.exercise && t.e1rm) maxes[t.exercise.trim().toLowerCase()] = Number(t.e1rm);
    }
  }
  return maxes;
});

/**
 * Gli avvisi gentili sui pagamenti per il cliente (rinnovo del coaching,
 * pacchetto finito, sessioni PT da sistemare) e le sessioni PT che gli restano.
 * In pausa o a fine percorso nessun avviso.
 */
export async function getMyPaymentNotices(input: {
  clientId: string;
  clientStatus: string | null;
  row: BillingRow | null | undefined;
  coach: string;
}): Promise<{ notices: ClientNotice[]; ptLeft: number | null; pay: BillingStatus | null }> {
  if (input.clientStatus === "paused" || input.clientStatus === "archived") return { notices: [], ptLeft: null, pay: null };
  const supabase = await createClient();
  const [{ data: pt }, { data: client }, credit, { data: unpaid }] = await Promise.all([
    supabase.rpc("my_pt_balance"),
    supabase.from("clients").select("pt_session_price").eq("id", input.clientId).maybeSingle(),
    getClientCredit(supabase, input.clientId, input.row?.kind === "package" ? "lessons" : "coaching"),
    // periodi rimasti "da saldare" (ha pagato quello dopo ma non questo)
    supabase.from("payments").select("id, period_start, period_end").eq("client_id", input.clientId).eq("unpaid", true).not("period_start", "is", null).not("period_end", "is", null),
  ]);
  const row = input.row ?? null;
  const kind = (row?.kind ?? null) as PlanKind | null;
  const rows = (unpaid ?? []).map((r) => ({ id: r.id, period_start: r.period_start!, period_end: r.period_end! }));
  const status = row ? clientFacingStatus(withUnpaidRows(billingStatus({ ...row, kind: kind! }, todayISO(), 7), rows, todayISO())) : null;
  const balance = pt?.[0] ? { bought: Number(pt[0].bought), used: Number(pt[0].used) } : null;
  return {
    notices: clientNotices({
      status,
      kind,
      planAmount: Number(row?.amount ?? 0),
      credit,
      pt: balance,
      ptPrice: client?.pt_session_price ? Number(client.pt_session_price) : null,
      coach: input.coach,
      formatDate: dayMonth,
    }),
    ptLeft: ptLeft(balance, kind),
    pay: status,
  };
}
