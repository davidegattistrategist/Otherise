"use client";

/** Riassunto AI delle ultime settimane del cliente con bozza di risposta all'ultimo check-up. */
import { useState } from "react";
import { Button, Card, Eyebrow, Notice } from "@/components/ui";
import { IconSparkle } from "@/components/icons";

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="text-sm font-semibold">{title}</div>
      <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-[15px] text-ink-soft">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </div>
  );
}

type Brief = { working: string[]; slipping: string[]; focus: string[]; reply: string };

export function AiCheckinBrief({ clientId, replyTargetId }: { clientId: string; replyTargetId: string | null }) {
  const [busy, setBusy] = useState(false);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/checkin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Errore");
      setBrief(data as Brief);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
    }
  };
  const useReply = () => {
    const el = replyTargetId ? (document.getElementById(replyTargetId) as HTMLTextAreaElement | null) : null;
    if (el && brief) {
      el.value = brief.reply;
      el.focus();
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Eyebrow>Riassunto con l&apos;AI</Eyebrow>
          <p className="mt-1 text-sm text-muted">Legge check-up, logbook, check e note di sessione: cosa funziona, cosa sta calando, su cosa concentrarsi. Prepara anche una bozza di risposta.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={run} disabled={busy}><IconSparkle size={16} /> {busy ? "Sto leggendo…" : brief ? "Rifai" : "Prepara il riassunto"}</Button>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {brief ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Section title="Cosa funziona" items={brief.working} />
          <Section title="Da tenere d'occhio" items={brief.slipping} />
          <Section title="Su cosa puntare" items={brief.focus} />
          <div className="rounded-2xl bg-sand px-4 py-3 sm:col-span-3">
            <div className="text-sm font-semibold">Bozza di risposta</div>
            <p className="mt-1 text-[15px] whitespace-pre-line">{brief.reply}</p>
            {replyTargetId ? <button type="button" onClick={useReply} className="mt-2 text-sm font-semibold underline">Usala come risposta all&apos;ultimo check-up</button> : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
