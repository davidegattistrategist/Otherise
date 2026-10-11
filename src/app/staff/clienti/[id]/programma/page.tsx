import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { getStaffClient } from "@/lib/data/client";
import { createClient } from "@/lib/supabase/server";
import { formatShort, todayISO } from "@/lib/dates";
import { displayWeek, programEndDate, weekPosition } from "@/lib/program/schedule";
import { Card, Dot, EmptyState, Eyebrow, Pill, ProgressBar, Select, buttonClass } from "@/components/ui";
import { SubmitButton } from "@/components/form-bits";
import { IconSparkle } from "@/components/icons";
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
    supabase.from("programs").select("id, title, weeks, start_date, status, source, updated_at").eq("client_id", id).order("start_date", { ascending: false, nullsFirst: true }),
    supabase.from("programs").select("id, title, weeks").eq("is_template", true).order("title"),
    supabase.from("workout_logs").select("program_id, completed").eq("client_id", id).eq("completed", true),
  ]);
  const doneBy = new Map<string, number>();
  (logs ?? []).forEach((l) => doneBy.set(l.program_id, (doneBy.get(l.program_id) ?? 0) + 1));
  const all = programs ?? [];
  const published = all.filter((p) => p.status === "published" && p.start_date);
  const current = published.find((p) => p.start_date! <= today) ?? published[published.length - 1] ?? null;
  const latestBase = current ?? all.find((p) => p.status !== "draft") ?? null;
  const ai = aiEnabled();
  const [profile, { data: baseContent }] = await Promise.all([
    getAiProfile(supabase, id),
    latestBase ? supabase.from("programs").select("content").eq("id", latestBase.id).single() : Promise.resolve({ data: null }),
  ]);
  const balance = baseContent ? programBalance(parseContent(baseContent.content)) : null;
  const hasBalance = balance && Object.values(balance.sets).some((n) => n > 0);

  return (
    <div className="flex flex-col gap-6">
      {/* azioni rapide */}
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]">
        {latestBase ? (
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
        ) : null}
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
      </div>

      {/* elenco programmi */}
      {all.length === 0 ? (
        <EmptyState title="Ancora nessun programma">Crealo da zero, da un modello, oppure importa la scheda dal foglio Google qui sotto.</EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {all.map((p) => {
            const isCurrent = current?.id === p.id;
            const pos = p.start_date ? weekPosition(p.start_date, p.weeks, today) : null;
            const week = p.start_date ? displayWeek(p.start_date, p.weeks, today) : null;
            return (
              <Link key={p.id} href={`/staff/programmi/${p.id}`} className="block rounded-[24px] bg-card p-5 hover:bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-semibold">{p.title}</span>
                      <Pill active={p.status === "published"}>{STATUS[p.status as keyof typeof STATUS]}</Pill>
                      {isCurrent ? <Pill><Dot tone="accent" /> In corso</Pill> : null}
                      {p.source === "ai" ? <Pill><IconSparkle size={13} /> AI</Pill> : null}
                    </div>
                    <div className="mt-1 text-sm text-muted">
                      {p.weeks} settimane
                      {p.start_date ? ` · dal ${formatShort(p.start_date)} al ${formatShort(programEndDate(p.start_date, p.weeks))}` : ""}
                      {doneBy.get(p.id) ? ` · ${doneBy.get(p.id)} sessioni registrate` : ""}
                    </div>
                  </div>
                  <span className={buttonClass("secondary", "sm")}>Apri</span>
                </div>
                {isCurrent && pos?.state === "running" && week ? (
                  <div className="mt-4 flex items-center gap-3">
                    <span className="shrink-0 text-sm font-semibold">Settimana {week} di {p.weeks}</span>
                    <ProgressBar value={(week / p.weeks) * 100} />
                  </div>
                ) : null}
              </Link>
            );
          })}
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

      <Card>
        <Eyebrow className="mb-4">Importa dal foglio Google</Eyebrow>
        <ImportForm action={importFromSheet.bind(null, id)} />
      </Card>
    </div>
  );
}
