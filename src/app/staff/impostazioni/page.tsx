import type { Metadata } from "next";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_MODEL } from "@/lib/ai/claude";
import { formatEuro } from "@/lib/billing";
import { todayISO } from "@/lib/dates";
import { Card, Dot, Eyebrow, PageTitle, ProgressBar } from "@/components/ui";
import { MethodForm, SettingsForm } from "./forms";
import { saveMethod, saveSettings } from "./actions";

export const metadata: Metadata = { title: "Impostazioni" };

const METHOD_PLACEHOLDER_HINT = `Esempi di cosa scrivere: come imposti le fasi (es. intensificazione, volume, scarico), come progredisci di settimana in settimana, quante sessioni e che split usi, come scrivi le prescrizioni, il riscaldamento tipo, il lavoro posturale e di core, cosa eviti con chi ha dolori.`;

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
  const [{ data: settings }, { data: usage }, { count: examples }] = await Promise.all([
    supabase.from("app_settings").select("business_name, coaching_method, reminder_days, ai_monthly_budget_eur").maybeSingle(),
    supabase.from("ai_requests").select("cost_eur, kind").gte("created_at", `${monthStart}T00:00:00Z`),
    supabase.from("programs").select("id", { count: "exact", head: true }).eq("is_ai_example", true),
  ]);
  const s = settings ?? { business_name: "Otherise", coaching_method: "", reminder_days: 7, ai_monthly_budget_eur: 20 };
  const spent = (usage ?? []).reduce((t, u) => t + Number(u.cost_eur), 0);
  const budget = Number(s.ai_monthly_budget_eur);
  const hasAi = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasEmail = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  const hasCron = Boolean(process.env.CRON_SECRET);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle eyebrow="Solo titolare" title="Impostazioni e metodo" />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
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

        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-4">
            <Eyebrow>Attività</Eyebrow>
            <SettingsForm action={saveSettings} values={s} />
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
              <Status ok={hasAi}>{hasAi ? "Assistente AI attivo" : "Assistente AI spento: manca ANTHROPIC_API_KEY su Vercel"}</Status>
              <Status ok={hasEmail}>{hasEmail ? "Email di avviso attive" : "Email di avviso spente: mancano RESEND_API_KEY ed EMAIL_FROM (restano le notifiche in app)"}</Status>
              <Status ok={hasCron}>{hasCron ? "Controlli automatici giornalieri attivi" : "Controlli giornalieri spenti: manca CRON_SECRET"}</Status>
            </ul>
            <p className="text-sm text-muted">Come si impostano: GUIDA-INSTALLAZIONE.md nel progetto.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
