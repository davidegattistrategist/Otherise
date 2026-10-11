/**
 * Notifiche: in vista quelle da leggere; quelle lette vanno nell'archivio
 * (apribile in fondo). Una notifica si legge aprendola o con la spunta.
 */
import { createClient } from "@/lib/supabase/server";
import { formatShort, todayISO } from "@/lib/dates";
import { markAllRead, markRead, openNotification } from "@/app/notifiche/actions";
import { Dot, EmptyState, cx } from "./ui";
import { SubmitButton } from "./form-bits";
import { IconCheck, IconDown } from "./icons";

function when(iso: string) {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const time = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }).format(d);
  return day === todayISO() ? `oggi alle ${time}` : formatShort(day);
}

type Row = { id: string; title: string; body: string; link: string | null; read_at: string | null; created_at: string };

function Item({ n, dark }: { n: Row; dark?: boolean }) {
  return (
    <li className={cx("flex items-stretch border-t first:border-t-0", dark ? "border-line-dark" : "border-sand-deep")}>
      <form action={openNotification.bind(null, n.id)} className="min-w-0 flex-1">
        <button type="submit" className={cx("flex w-full items-start gap-3 py-4 pr-2 pl-5 text-left", dark ? "hover:bg-white/5" : "hover:bg-white")}>
          <Dot tone={n.read_at ? "muted" : "accent"} className={cx("mt-2", n.read_at && "opacity-0")} />
          <span className="min-w-0 flex-1">
            <span className={cx("block", n.read_at ? "font-normal" : "font-semibold")}>{n.title}</span>
            {n.body ? <span className={cx("mt-0.5 block text-sm", dark ? "text-muted-dark" : "text-muted")}>{n.body}</span> : null}
          </span>
          <span className={cx("shrink-0 text-xs", dark ? "text-muted-dark" : "text-muted")}>{when(n.created_at)}</span>
        </button>
      </form>
      {!n.read_at ? (
        <form action={markRead.bind(null, n.id)} className="flex items-center pr-3">
          <button type="submit" aria-label={`Segna come letta: ${n.title}`} title="Segna come letta" className="flex h-10 w-10 items-center justify-center rounded-full text-muted ring-1 ring-sand-deep hover:bg-sand hover:text-ink">
            <IconCheck size={17} />
          </button>
        </form>
      ) : null}
    </li>
  );
}

export async function NotificationList({ dark }: { dark?: boolean }) {
  const supabase = await createClient();
  const [{ data: unreadRows }, { data: readRows }] = await Promise.all([
    supabase.from("notifications").select("id, title, body, link, read_at, created_at").is("read_at", null).order("created_at", { ascending: false }).limit(100),
    supabase.from("notifications").select("id, title, body, link, read_at, created_at").not("read_at", "is", null).order("created_at", { ascending: false }).limit(60),
  ]);
  const unread = (unreadRows ?? []) as Row[];
  const read = (readRows ?? []) as Row[];
  const box = cx("flex flex-col overflow-hidden rounded-[24px]", dark ? "bg-ink-soft" : "bg-card");
  return (
    <div className="flex flex-col gap-3">
      {unread.length ? (
        <>
          <form action={markAllRead} className="flex justify-end">
            <SubmitButton variant="ghost" size="sm" pendingText="…">Segna tutte come lette</SubmitButton>
          </form>
          <ul className={box}>{unread.map((n) => <Item key={n.id} n={n} dark={dark} />)}</ul>
        </>
      ) : (
        <EmptyState title="Nessuna notifica da leggere">Qui arrivano gli avvisi importanti: niente rumore, solo quello che serve. Quelle già lette sono nell&apos;archivio.</EmptyState>
      )}
      {read.length ? (
        <details className={cx("group", box)}>
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="font-semibold">Archivio</span>
              <span className={cx("ml-2 text-sm", dark ? "text-muted-dark" : "text-muted")}>{read.length === 60 ? "le ultime 60 lette" : read.length === 1 ? "1 letta" : `${read.length} lette`}</span>
            </span>
            <IconDown size={18} className="shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <ul className="flex flex-col">{read.map((n) => <Item key={n.id} n={n} dark={dark} />)}</ul>
        </details>
      ) : null}
    </div>
  );
}
