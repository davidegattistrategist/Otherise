import type { Metadata } from "next";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseServiceKey } from "@/lib/supabase/env";
import { DEFAULT_MODEL } from "@/lib/ai/claude";
import { formatEuro } from "@/lib/billing";
import { DEFAULT_PAYMENT_MESSAGE } from "@/lib/whatsapp";
import { formatLong, todayISO } from "@/lib/dates";
import { Card, Dot, Eyebrow, PageTitle, ProgressBar } from "@/components/ui";
import { LessonsForm, MethodForm, PrivacyForm, SettingsForm } from "./forms";
import { saveLessons, saveMethod, savePrivacy, saveSettings } from "./actions";
import { correctionTrend } from "@/lib/ai/learn";

export const metadata: Metadata = { title: "Impostazioni" };

const METHOD_PLACEHOLDER_HINT = `Esempi di cosa scrivere: come imposti le fasi (es. intensificazione, volume, scarico), come progredisci di settimana in settimana, quante sessioni e che split usi, come scrivi le prescrizioni, il riscaldamento tipo, il lavoro posturale e di core, cosa eviti con chi ha dolori.`;

/** La chiave secret di Supabase funziona? (serve a inviti, notifiche, foto della chat) */
async function serviceKeyStatus(): Promise<{ ok: boolean; text: string }> {
  const key = supabaseServiceKey();
  const fix = "Ricopiala da Supabase → Project Settings → API Keys → Secret keys (inizia con sb_secret_), incollala su Vercel in SUPABASE_SERVICE_ROLE_KEY e rifai il deploy.";
  if (!key) return { ok: false, text: `Manca la chiave secret di Supabase. ${fix}` };
  if (key.startsWith("sb_publishable_")) return { ok: false, text: `In SUPABASE_SERVICE_ROLE_KEY c'è la chiave publishable al posto della secret. ${fix}` };
  try {
    const { error } = await createAdminClient().auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) return { ok: false, text: `La chiave secret di Supabase non funziona (${error.message}). ${fix}` };
  } catch (e) {
    return { ok: false, text: `La chiave secret di Supabase non funziona (${e instanceof Error ? e.message : "errore"}). ${fix}` };
  }
  return { ok: true, text: "Collegamento completo a Supabase attivo (inviti, avvisi, foto e video della chat)" };
}

function Status({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[15px]">
      <Dot tone={ok ? "ink" : "accent"} className="mt-2" />
      <span>{children}</span>
    </li>
  );
}

export default async function SettingsPage() {
  await requireOwner();
  const supabase = await createClient();
  const monthStart = `${todayISO().slice(0, 7)}-01`;
  const [{ data: settings }, { data: usage }, { count: examples }, { data: learned }, trend] = await Promise.all([
    supabase.from("app_settings").select("business_name, coaching_method, reminder_days, ai_monthly_budget_eur, payment_message, legal_name, legal_address, legal_tax_id, privacy_email").maybeSingle(),
    supabase.from("ai_requests").select("cost_eur, kind").gte("created_at", `${monthStart}T00:00:00Z`),
    supabase.from("programs").select("id", { count: "exact", head: true }).eq("is_ai_example", true),
    supabase.from("app_settings").select("ai_lessons, ai_lessons_updated_at").maybeSingle(),
    correctionTrend(supabase),
  ]);
  const s = settings ?? { business_name: "Otherise", coaching_method: "", reminder_days: 7, ai_monthly_budget_eur: 20, payment_message: "", legal_name: "", legal_address: "", legal_tax_id: "", privacy_email: "" };
  const privacyMissing = !s.legal_name || !s.legal_address || !s.legal_tax_id || !s.privacy_email;
  const spent = (usage ?? []).reduce((t, u) => t + Number(u.cost_eur), 0);
  const budget = Number(s.ai_monthly_budget_eur);
  const hasAi = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasEmail = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  const hasCron = Boolean(process.env.CRON_SECRET);
  const service = await serviceKeyStatus();

  return (
    <div className="flex flex-col gap-6">
      <PageTitle eyebrow="Solo titolare" title="Impostazioni e metodo" />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-4">
          <div>
            <Eyebrow>Metodo di lavoro per l&apos;assistente AI</Eyebrow>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              Questo testo viene letto dall&apos;assistente ogni volta che prepara o modifica un programma, insieme ai programmi che segni come
              “esempio per l&apos;AI” ({examples ?? 0} adesso). Più è preciso, più le bozze ti somigliano. {METHOD_PLACEHOLDER_HINT}
            </p>
          </div>
          <MethodForm action={saveMethod} value={s.coaching_method} />
        </Card>

        <Card className="flex flex-col gap-4" id="lezioni">
          <div>
            <Eyebrow>Cosa ha imparato dalle tue correzioni</Eyebrow>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              Quando pubblichi una bozza preparata dall&apos;AI, l&apos;app confronta la bozza con il programma che hai pubblicato e ne ricava delle lezioni generali,
              che l&apos;assistente legge a ogni bozza insieme alle tue ultime correzioni. Le correzioni legate al singolo cliente non diventano lezioni.
              {learned?.ai_lessons_updated_at ? ` Ultimo aggiornamento: ${formatLong(learned.ai_lessons_updated_at.slice(0, 10))}.` : ""}
            </p>
          </div>
          {trend.length ? (
            <div className="rounded-2xl bg-sand/70 px-4 py-3 text-sm" data-testid="ai-trend">
              <div className="font-semibold">Righe che hai corretto nelle ultime bozze</div>
              <div className="mt-1 text-muted">{trend.map((t) => `${t}%`).join(" → ")} <span className="text-xs">(dalla più vecchia alla più recente: l&apos;obiettivo è arrivare vicino a zero)</span></div>
            </div>
          ) : null}
          <LessonsForm action={saveLessons} value={learned?.ai_lessons ?? ""} />
        </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-4">
            <Eyebrow>Attività</Eyebrow>
            <SettingsForm action={saveSettings} values={s} defaultMessage={DEFAULT_PAYMENT_MESSAGE} />
          </Card>

          <Card id="privacy" className="flex scroll-mt-6 flex-col gap-4">
            <div>
              <Eyebrow>Privacy</Eyebrow>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Questi dati compaiono nell&apos;<a href="/privacy" target="_blank" className="font-semibold text-ink underline">informativa</a> che i clienti confermano al primo accesso.
                {privacyMissing ? " Completali prima di invitare i clienti." : ""} Per chi inizia di persona c&apos;è il <a href="/privacy/modulo" target="_blank" className="font-semibold text-ink underline">modulo da stampare</a>.
              </p>
            </div>
            <PrivacyForm action={savePrivacy} values={s} />
          </Card>

          <Card className="flex flex-col gap-3">
            <Eyebrow>Assistente AI questo mese</Eyebrow>
            <div className="flex items-baseline justify-between text-[15px]"><span>{formatEuro(Math.round(spent * 100) / 100)} spesi</span><span className="text-muted">tetto {formatEuro(budget)}</span></div>
            <ProgressBar value={budget > 0 ? (spent / budget) * 100 : 0} />
            <p className="text-sm text-muted">{(usage ?? []).length} richieste. Modello: {process.env.ANTHROPIC_MODEL || DEFAULT_MODEL}. Superato il tetto, l&apos;assistente si ferma fino al mese dopo.</p>
          </Card>

          <Card className="flex flex-col gap-3">
            <Eyebrow>Collegamenti</Eyebrow>
            <ul className="flex flex-col gap-2">
              <Status ok={service.ok}>{service.text}</Status>
              <Status ok={hasAi}>{hasAi ? "Assistente AI attivo" : "Assistente AI spento: serve la chiave di Anthropic su Vercel (ANTHROPIC_API_KEY, guida di installazione passo 3)"}</Status>
              <Status ok={hasEmail}>{hasEmail ? "Email di avviso attive" : "Email di avviso spente: serve collegare Resend (guida di installazione passo 4). Le notifiche nell'app funzionano lo stesso"}</Status>
              <Status ok={hasCron}>{hasCron ? "Controlli automatici giornalieri attivi" : "Controlli giornalieri spenti: manca CRON_SECRET"}</Status>
            </ul>
            <p className="text-sm text-muted">Come si attivano: guida di installazione (file GUIDA-INSTALLAZIONE.md nel progetto su GitHub). Dopo aver cambiato una variabile su Vercel serve un nuovo deploy.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
