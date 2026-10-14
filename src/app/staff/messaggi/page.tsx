import Link from "next/link";
import { bySurname, listName, nameMatches } from "@/lib/names";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { rpcOr } from "@/lib/data/rpc";
import { previewOf } from "@/lib/chat";
import type { ChatAttachment } from "@/lib/chat-shared";
import { Dot, EmptyState, PageTitle } from "@/components/ui";
import { LiveSearch } from "@/components/live-search";

export const metadata: Metadata = { title: "Messaggi" };

function when(iso: string) {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() - 86_400_000));
  if (day === today) return new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }).format(d);
  if (day === yesterday) return "ieri";
  return new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short" }).format(d);
}

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ q?: string; vista?: string }> }) {
  const { q, vista } = await searchParams;
  const onlyToAnswer = vista === "da-rispondere";
  await requireStaff();
  const supabase = await createClient();
  const [{ data: clients }, { data: recent }, { data: unread }] = await Promise.all([
    supabase.from("clients").select("id, first_name, last_name, user_id, status").order("last_name").order("first_name"),
    rpcOr<Array<{ client_id: string; body: string; attachments: unknown; created_at: string; deleted_at: string | null; sender_id: string | null }>>(supabase.rpc("last_messages", {}), async () =>
      (await supabase.from("messages").select("client_id, body, attachments, created_at, deleted_at, sender_id").order("created_at", { ascending: false }).limit(1000)).data ?? [],
    ).then((data) => ({ data })),
    supabase.rpc("my_unread_chats"),
  ]);
  const last = new Map<string, { preview: string; at: string; sender: string | null }>();
  for (const m of recent ?? []) {
    if (last.has(m.client_id)) continue;
    last.set(m.client_id, { preview: m.deleted_at ? "Messaggio eliminato" : previewOf(m.body, (m.attachments as ChatAttachment[]) ?? []), at: m.created_at, sender: m.sender_id });
  }
  const unreadBy = new Map((unread ?? []).map((u) => [u.client_id, u.unread]));
  const needle = (q ?? "").trim().toLowerCase();
  const rows = (clients ?? [])
    .filter((c) => !needle || nameMatches(c, needle))
    // ex clienti: solo se c'è già una conversazione o se li cerchi
    .filter((c) => c.status !== "archived" || last.has(c.id) || needle)
    .map((c) => {
      const l = last.get(c.id);
      const unread = unreadBy.get(c.id) ?? 0;
      // da rispondere: messaggi che non hai ancora visto. Una chat aperta esce
      // dall'elenco anche se non rispondi; con "Segna da leggere" ci torna.
      return { ...c, last: l, unread, toAnswer: unread > 0 };
    })
    .sort((a, b) => (b.last?.at ?? "").localeCompare(a.last?.at ?? "") || bySurname(a, b));

  const toAnswer = rows.filter((r) => r.toAnswer).length;
  const shown = onlyToAnswer ? rows.filter((r) => r.toAnswer) : rows;
  const tab = (active: boolean) => `flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold ${active ? "bg-ink text-card" : "bg-card text-ink"}`;
  const qs = q ? `&q=${encodeURIComponent(q)}` : "";
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageTitle title="Messaggi">
        <p className="text-[15px] text-muted">Chat con i clienti: testo, foto e video. Il titolare vede tutte le conversazioni, il collaboratore quelle dei suoi clienti.</p>
      </PageTitle>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5" role="group" aria-label="Quali chat">
          <Link href={`/staff/messaggi?vista=tutte${qs}`} aria-current={!onlyToAnswer ? "page" : undefined} className={tab(!onlyToAnswer)}>Tutte</Link>
          <Link href={`/staff/messaggi?vista=da-rispondere${qs}`} aria-current={onlyToAnswer ? "page" : undefined} className={tab(onlyToAnswer)}>
            Da rispondere{toAnswer ? <span className={`rounded-full px-1.5 text-xs ${onlyToAnswer ? "bg-card text-ink" : "bg-accent text-white"}`}>{toAnswer}</span> : null}
          </Link>
        </div>
        <form className="min-w-0 flex-1" role="search">
          {onlyToAnswer ? <input type="hidden" name="vista" value="da-rispondere" /> : null}
          <LiveSearch defaultValue={q} placeholder="Cerca un cliente" label="Cerca un cliente" />
        </form>
      </div>
      {shown.length === 0 ? (
        onlyToAnswer ? <EmptyState title="Nessuna chat da rispondere">Hai visto tutti i messaggi. Se una chat ti serve ancora, aprila e premi “Segna da leggere”.</EmptyState> : <EmptyState title="Nessun cliente">Aggiungi un cliente per iniziare a scrivergli.</EmptyState>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-[24px] bg-card">
          {shown.map((c) => (
            <li key={c.id} className="border-t border-sand-deep first:border-t-0">
              <Link href={`/staff/messaggi/${c.id}`} className="flex min-h-16 items-center gap-3 px-5 py-3 hover:bg-white">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sand text-sm font-bold">{c.last_name[0] ?? ""}{c.first_name[0]}</span>
                <span className="min-w-0 flex-1">
                  <span className={c.unread ? "block font-bold" : "block font-semibold"}>{listName(c)}{c.status === "archived" ? <span className="ml-2 text-xs font-normal text-muted">percorso terminato</span> : c.status === "paused" ? <span className="ml-2 text-xs font-normal text-muted">in pausa</span> : null}</span>
                  <span className="block truncate text-sm text-muted">{c.last ? c.last.preview : c.user_id ? "Nessun messaggio: scrivigli tu per primo" : "Non ha ancora l'app: invitalo dalla scheda"}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  {c.last ? <span className="text-xs text-muted">{when(c.last.at)}</span> : null}
                  {c.unread ? <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold text-white">{c.unread}</span> : c.last ? <Dot tone="muted" className="opacity-0" /> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
