/**
 * Avviso gentile al cliente (rinnovo del coaching, pacchetto finito, sessioni
 * PT da sistemare). Il testo viene da `clientNotices` in src/lib/client-notice.ts.
 */
import type { ClientNotice } from "@/lib/client-notice";
import { IconChat, IconCheck, IconLeaf } from "./icons";
import { LinkButton, cx } from "./ui";

export function PaymentNotices({ notices, coach }: { notices: ClientNotice[]; coach: string }) {
  if (!notices.length) return null;
  const needsTalk = notices.some((n) => n.kind !== "covered");
  return (
    <section
      aria-label="Un pensiero sul tuo percorso"
      className={cx(
        "relative overflow-hidden rounded-[24px] p-5 sm:p-6",
        needsTalk ? "bg-gradient-to-br from-accent-soft/80 via-card to-card" : "bg-card",
      )}
    >
      {/* due cerchi morbidi di sfondo, solo decorazione */}
      <span aria-hidden="true" className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-accent-soft/60" />
      <span aria-hidden="true" className="pointer-events-none absolute -right-2 top-14 h-12 w-12 rounded-full bg-accent-soft/40" />
      <div className="relative flex flex-col gap-4">
        {notices.map((n, idx) => (
          <div key={n.kind} className={cx("flex gap-3", idx > 0 && "border-t border-sand-deep/80 pt-4")}>
            <span aria-hidden="true" className={cx("mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full", n.kind === "covered" ? "bg-sand-deep/70 text-ink" : "bg-card text-accent-deep shadow-[0_1px_0_rgba(0,0,0,0.04)]")}>
              {n.kind === "covered" ? <IconCheck size={20} /> : <IconLeaf size={20} />}
            </span>
            <div className="flex min-w-0 flex-col gap-1.5">
              <h2 className="text-[17px] leading-snug font-semibold">{n.title}</h2>
              <p className="text-[15px] leading-relaxed text-ink-soft">{n.text}</p>
              {n.amount ? <p className="mt-0.5 w-fit rounded-full bg-card/80 px-3 py-1 text-sm font-semibold tabular text-ink">{n.amount}</p> : null}
            </div>
          </div>
        ))}
        {needsTalk ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-[52px]">
            <LinkButton href="/cliente/messaggi" size="sm" className="gap-2">
              <IconChat size={18} /> Scrivi a {coach}
            </LinkButton>
            <span className="text-xs text-muted">I pagamenti si fanno fuori dall&apos;app, come sempre.</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
