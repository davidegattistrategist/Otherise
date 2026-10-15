import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { getStaffClient } from "@/lib/data/client";
import { createClient } from "@/lib/supabase/server";
import { formatShort, todayISO } from "@/lib/dates";
import { currentProgram, displayWeek, programEndDate, weekPosition } from "@/lib/program/schedule";
import { Card, Dot, EmptyState, Eyebrow, Pill, ProgressBar, Select, buttonClass } from "@/components/ui";
import { SubmitButton } from "@/components/form-bits";
import { IconDown, IconSparkle } from "@/components/icons";
import { createEmptyProgram, createFromTemplate, createNextPhase, importFromSheet } from "../../../programmi/actions";
import { aiEnabled } from "@/lib/ai/claude";
import { ImportForm } from "./import-form";
import { AiProfileForm } from "./ai-profile-form";
import { saveAiProfileAction } from "./actions";
import { getAiProfile } from "@/lib/data/ai-profile";
import { programBalance } from "@/lib/program/balance";
import { parseContent } from "@/lib/program/types";

export const metadata: Metadata = { title: "Programma" };

const STATUS = { draft: "Bozza", published: "Pubblicato", archived: "Archiviato" } as const;

export default async function ClientProgramsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireStaff();
  const client = await getStaffClient(id);
  const supabase = await createClient();
  const today = todayISO();
  const [{ data: programs }, { data: templates }, { data: logs }] = await Promise.all([
    supabase.from("programs").select("id, title, weeks, start_date, status, source, updated_at, created_at").eq("client_id", id).order("start_date", { ascending: false, nullsFirst: true }),
    supabase.from("programs").select("id, title, weeks").eq("is_template", true).order("title"),
    supabase.from("workout_logs").select("program_id, completed").eq("client_id", id).eq("completed", true),
  ]);
  const doneBy = new Map<string, number>();
  (logs ?? []).forEach((l) => doneBy.set(l.program_id, (doneBy.get(l.program_id) ?? 0) + 1));
  // bozze in cima, poi le fasi con la data (dalla più recente), poi quelle importate senza data (dalla più recente)
  const rank = (p: { status: string; start_date: string | null }) => (p.status === "draft" ? 0 : p.start_date ? 1 : 2);
  const all = [...(programs ?? [])].sort((a, b) => rank(a) - rank(b) || (b.start_date ?? "").localeCompare(a.start_date ?? "") || b.created_at.localeCompare(a.created_at));
  const published = all.filter((p) => p.status === "published" && p.start_date);
  const current = currentProgram(published, today);
  const latestBase = current ?? all.find((p) => p.status !== "draft") ?? null;
  // in vista: bozze, fase in corso e quelle che devono ancora iniziare
  const isActive = (p: (typeof all)[number]) => p.status === "draft" || p.id === current?.id || (p.status === "published" && Boolean(p.start_date) && p.start_date! > today);
  const active = all.filter(isActive);
  const archived = all.filter((p) => !isActive(p));
  const ai = aiEnabled();
  const [profile, { data: baseContent }] = await Promise.all([
    getAiProfile(supabase, id),
    latestBase ? supabase.from("programs").select("content").eq("id", latestBase.id).single() : Promise.resolve({ data: null }),
  ]);
  const balance = baseContent ? programBalance(parseContent(baseContent.content)) : null;
  const hasBalance = balance && Object.values(balance.sets).some((n) => n > 0);

  const otherCards = (
    <>
      <Card className="flex flex-col gap-4">
        <Eyebrow>Da un modello</Eyebrow>
        {templates?.length ? (
          <form action={createFromTemplate.bind(null, id)} className="flex flex-col gap-3">
            <label htmlFor="template_id" className="sr-only">Modello</label>
            <Select id="template_id" name="template_id" required>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.title} · {t.weeks} sett.</option>)}
            </Select>
            <div><SubmitButton variant="secondary" pendingText="Preparo…">Usa il modello</SubmitButton></div>
          </form>
        ) : (
          <p className="text-[15px] text-muted">Nessun modello ancora. <Link className="font-semibold underline" href="/staff/modelli">Creane uno</Link> oppure salva un programma come modello.</p>
        )}
      </Card>
      <Card className="flex flex-col gap-4">
        <Eyebrow>Da zero</Eyebrow>
        <p className="text-[15px] text-muted">Una griglia vuota con il primo giorno pronto.</p>
        <form action={createEmptyProgram.bind(null, id)} className="mt-auto">
          <SubmitButton variant="secondary" pendingText="Preparo…">Programma vuoto</SubmitButton>
        </form>
      </Card>
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* azioni rapide: con un programma già fatto la strada è quasi sempre la nuova fase; le altre a richiesta */}
      {latestBase ? (
        <div className="flex flex-col gap-3">
          <Card dark className="flex flex-col gap-4">
            <Eyebrow dark>Nuova fase</Eyebrow>
            <p className="text-[15px] leading-relaxed text-muted-dark">
              Parte da “{latestBase.title}”: stessi giorni ed esercizi, settimana 1 già compilata con quello che {client.first_name} ha fatto davvero.
            </p>
            <form action={createNextPhase.bind(null, latestBase.id)} className="mt-auto flex flex-wrap items-center gap-2.5">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-dark">Settimane</span>
                <Select name="weeks" defaultValue={client.phase_weeks ?? latestBase.weeks} className="!min-h-10 !w-20 !border-line-dark !bg-[#26241f] !py-1 !text-card">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                </Select>
              </label>
              <SubmitButton variant="light" pendingText="Preparo…">Crea la nuova fase</SubmitButton>
            </form>
            {ai ? (
              <p className="flex items-center gap-2 text-sm text-muted-dark"><IconSparkle size={16} /> Nella bozza trovi l&apos;assistente AI per completarla.</p>
            ) : null}
          </Card>
          <details className="group rounded-[24px] bg-card">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
              <span className="text-[15px]"><span className="font-semibold">Oppure</span> <span className="text-muted">da un modello o da zero</span></span>
              <IconDown size={18} className="shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <div className="grid gap-4 px-2 pb-2 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
              {otherCards}
            </div>
          </details>
        </div>
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]">{otherCards}</div>
      )}

      {/* elenco programmi: bozze, fase in corso e prossime; le fasi passate nell'archivio */}
      {all.length === 0 ? (
        <EmptyState title="Ancora nessun programma">Crealo da zero, da un modello, oppure importa la scheda dal foglio Google qui sotto.</EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {active.map((p) => <ProgramRow key={p.id} p={p} isCurrent={current?.id === p.id} today={today} done={doneBy.get(p.id) ?? 0} />)}
          {archived.length ? (
            <details className="group rounded-[24px] bg-card" open={active.length === 0}>
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
                <span>
                  <span className="text-lg font-semibold">Archivio</span>
                  <span className="ml-2 text-sm text-muted">{archived.length === 1 ? "1 fase passata" : `${archived.length} fasi passate`}</span>
                </span>
                <IconDown size={18} className="shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <div className="flex flex-col gap-2 px-2 pb-2">
                {archived.map((p) => <ProgramRow key={p.id} p={p} isCurrent={false} today={today} done={doneBy.get(p.id) ?? 0} compact />)}
              </div>
            </details>
          ) : null}
        </div>
      )}

      {ai ? (
        <Card className="flex flex-col gap-4" id="indicazioni-ai">
          <div>
            <Eyebrow>Indicazioni per l&apos;AI</Eyebrow>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              Un punto di partenza per le bozze di {client.first_name}, non regole fisse: l&apos;AI segue sempre il programma più recente che hai scritto tu.
              Quando pubblichi un programma che va in un&apos;altra direzione, tempo, gambe e spinte verticali si aggiornano da sole.
            </p>
          </div>
          {profile.auto_note ? <p className="rounded-xl bg-accent-soft/60 px-3 py-2 text-sm">{profile.auto_note}</p> : null}
          {hasBalance && latestBase ? (
            <div className="rounded-2xl bg-sand/70 px-4 py-3 text-sm" data-testid="program-balance">
              <div className="font-semibold">Com&apos;è fatto “{latestBase.title}” (serie a settimana)</div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-muted">
                <span>Dorso {balance.sets.tirata_verticale + balance.sets.tirata_orizzontale}</span>
                <span>Gambe {balance.sets.accosciata + balance.sets.hinge}{balance.squatShare !== null ? ` (${balance.squatShare}% accosciata)` : ""}</span>
                <span>Spinte orizzontali {balance.sets.spinta_orizzontale}</span>
                <span>Spinte verticali {balance.sets.spinta_verticale}</span>
                {balance.sets.braccia ? <span>Braccia {balance.sets.braccia}</span> : null}
                <span>Addome {balance.sets.core}</span>
              </div>
              <div className="mt-1 text-muted">Durata stimata: {balance.minutes.map((m) => `${m.title} ~${m.minutes}'`).join(" · ")}</div>
            </div>
          ) : null}
          <AiProfileForm action={saveAiProfileAction.bind(null, id)} values={profile} actualSquat={balance?.squatShare ?? null} />
        </Card>
      ) : null}

      <details className="group rounded-[24px] bg-card">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <span className="text-[15px] font-semibold">Importa dal foglio Google</span>
          <IconDown size={18} className="shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-5 pb-5">
          <ImportForm action={importFromSheet.bind(null, id)} />
        </div>
      </details>
    </div>
  );
}

type ProgramItem = { id: string; title: string; weeks: number; start_date: string | null; status: string; source: string | null };

function ProgramRow({ p, isCurrent, today, done, compact }: { p: ProgramItem; isCurrent: boolean; today: string; done: number; compact?: boolean }) {
  const pos = p.start_date ? weekPosition(p.start_date, p.weeks, today) : null;
  const week = p.start_date ? displayWeek(p.start_date, p.weeks, today) : null;
  return (
    <Link href={`/staff/programmi/${p.id}`} className={compact ? "block rounded-[18px] px-3 py-3 hover:bg-white" : "block rounded-[24px] bg-card p-5 hover:bg-white"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={compact ? "font-semibold" : "text-lg font-semibold"}>{p.title}</span>
            {!compact ? <Pill active={p.status === "published"}>{STATUS[p.status as keyof typeof STATUS]}</Pill> : null}
            {isCurrent ? <Pill><Dot tone="accent" /> In corso</Pill> : null}
            {p.source === "ai" ? <Pill><IconSparkle size={13} /> AI</Pill> : null}
          </div>
          <div className="mt-1 text-sm text-muted">
            {p.weeks} settimane
            {p.start_date ? ` · dal ${formatShort(p.start_date)} al ${formatShort(programEndDate(p.start_date, p.weeks))}` : ""}
            {done ? ` · ${done} sessioni registrate` : ""}
          </div>
        </div>
        {!compact ? <span className={buttonClass("secondary", "sm")}>Apri</span> : null}
      </div>
      {isCurrent && pos?.state === "running" && week ? (
        <div className="mt-4 flex items-center gap-3">
          <span className="shrink-0 text-sm font-semibold">Settimana {week} di {p.weeks}</span>
          <ProgressBar value={(week / p.weeks) * 100} />
        </div>
      ) : null}
    </Link>
  );
}
