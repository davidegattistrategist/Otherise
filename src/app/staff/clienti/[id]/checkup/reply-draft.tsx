"use client";

/**
 * Bozza di risposta a un check-up preparata dall'assistente: si usa (e si
 * corregge) nella casella della risposta, oppure si scrive da zero.
 */
import { useState } from "react";
import { IconSparkle } from "@/components/icons";
import { requestCheckinDraft } from "./actions";

export function CheckinReplyDraft({
  clientId,
  checkinId,
  targetId,
  initial,
  canRequest,
}: {
  clientId: string;
  checkinId: string;
  targetId: string;
  initial: { id: string; body: string } | null;
  canRequest: boolean;
}) {
  const [draft, setDraft] = useState(initial);
  const [hidden, setHidden] = useState(false);
  const [used, setUsed] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = () => document.getElementById(targetId) as HTMLTextAreaElement | null;
  const apply = () => {
    const el = target();
    if (!el || !draft) return;
    el.value = draft.body;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
    el.focus();
    setUsed(draft.id);
    setHidden(true);
  };
  const scratch = () => {
    setHidden(true);
    setUsed("");
    target()?.focus();
  };
  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await requestCheckinDraft(clientId, checkinId);
      if (!r.ok) setError(r.error);
      else if (r.draft) {
        setDraft(r.draft);
        setHidden(false);
      }
    } catch {
      setError("L'assistente non ha risposto, riprova tra poco.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input type="hidden" name="draft_used" value={used} />
      {draft && !hidden ? (
        <div className="rounded-2xl border border-sand-deep bg-sand/60 p-3" aria-label="Bozza di risposta">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted uppercase"><IconSparkle size={14} /> Bozza di risposta</span>
            <button type="button" onClick={() => void ask()} disabled={busy} className="-my-2 min-h-10 px-2 text-sm font-semibold text-muted underline disabled:opacity-50">{busy ? "Sto riscrivendo…" : "Rifai"}</button>
          </div>
          <p className="mt-1.5 text-[15px] leading-snug whitespace-pre-wrap">{draft.body}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" onClick={apply} className="min-h-10 rounded-full bg-ink px-4 text-sm font-semibold text-card">Usa e modifica</button>
            <button type="button" onClick={scratch} className="min-h-10 rounded-full px-4 text-sm font-semibold ring-1 ring-sand-deep">Scrivo da zero</button>
          </div>
        </div>
      ) : !draft && canRequest ? (
        <button type="button" onClick={() => void ask()} disabled={busy} className="flex items-center gap-1.5 self-start text-sm font-semibold text-muted hover:text-ink disabled:opacity-60">
          <IconSparkle size={15} /> {busy ? "Sto scrivendo la bozza…" : "Prepara una bozza di risposta"}
        </button>
      ) : null}
      {error ? <p role="alert" className="rounded-xl bg-accent-soft px-3 py-2 text-sm">{error}</p> : null}
    </>
  );
}
