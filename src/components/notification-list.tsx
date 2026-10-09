import { createClient } from "@/lib/supabase/server";
import { formatShort, todayISO } from "@/lib/dates";
import { markAllRead, openNotification } from "@/app/notifiche/actions";
import { Dot, EmptyState, cx } from "./ui";
import { SubmitButton } from "./form-bits";

function when(iso: string) {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const time = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }).format(d);
  return day === todayISO() ? `oggi alle ${time}` : formatShort(day);
}

export async function NotificationList({ dark }: { dark?: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("id, title, body, link, read_at, created_at").order("created_at", { ascending: false }).limit(60);
  const list = data ?? [];
  const unread = list.filter((n) => !n.read_at).length;
  if (list.length === 0) return <EmptyState title="Nessuna notifica">Qui arrivano gli avvisi importanti: niente rumore, solo quello che serve.</EmptyState>;
  return (
    <div className="flex flex-col gap-3">
      {unread > 0 ? (
        <form action={markAllRead} className="flex justify-end">
          <SubmitButton variant="ghost" size="sm" pendingText="…">Segna tutte come lette</SubmitButton>
        </form>
      ) : null}
      <ul className={cx("flex flex-col overflow-hidden rounded-[24px]", dark ? "bg-ink-soft" : "bg-card")}>
        {list.map((n) => (
          <li key={n.id} className={cx("border-t first:border-t-0", dark ? "border-line-dark" : "border-sand-deep")}>
            <form action={openNotification.bind(null, n.id)}>
              <button type="submit" className={cx("flex w-full items-start gap-3 px-5 py-4 text-left", dark ? "hover:bg-white/5" : "hover:bg-white")}>
                <Dot tone={n.read_at ? "muted" : "accent"} className={cx("mt-2", n.read_at && "opacity-0")} />
                <span className="min-w-0 flex-1">
                  <span className={cx("block", n.read_at ? "font-normal" : "font-semibold")}>{n.title}</span>
                  {n.body ? <span className={cx("mt-0.5 block text-sm", dark ? "text-muted-dark" : "text-muted")}>{n.body}</span> : null}
                </span>
                <span className={cx("shrink-0 text-xs", dark ? "text-muted-dark" : "text-muted")}>{when(n.created_at)}</span>
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
