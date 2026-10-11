import Link from "next/link";
import { bySurname } from "@/lib/names";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { previewOf } from "@/lib/chat";
import type { ChatAttachment } from "@/lib/chat-shared";
import { Dot, EmptyState, Input, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Messaggi" };

function when(iso: string) {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return day === today
    ? new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }).format(d)
    : new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short" }).format(d);
}

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  await requireStaff();
  const supabase = await createClient();
  const [{ data: clients }, { data: recent }, { data: unread }] = await Promise.all([
    supabase.from("clients").select("id, first_name, last_name, user_id, status").neq("status", "archived").order("last_name").order("first_name"),
    supabase.from("messages").select("client_id, body, attachments, created_at, deleted_at, sender_id").order("created_at", { ascending: false }).limit(500),
    supabase.rpc("my_unread_chats"),
  ]);
  const last = new Map<string, { preview: string; at: string }>();
  for (const m of recent ?? []) {
    if (last.has(m.client_id)) continue;
    last.set(m.client_id, { preview: m.deleted_at ? "Messaggio eliminato" : previewOf(m.body, (m.attachments as ChatAttachment[]) ?? []), at: m.created_at });
  }
  const unreadBy = new Map((unread ?? []).map((u) => [u.client_id, u.unread]));
  const needle = (q ?? "").trim().toLowerCase();
  const rows = (clients ?? [])
    .filter((c) => !needle || `${c.first_name} ${c.last_name}`.toLowerCase().includes(needle))
    .map((c) => ({ ...c, last: last.get(c.id), unread: unreadBy.get(c.id) ?? 0 }))
    .sort((a, b) => (b.last?.at ?? "").localeCompare(a.last?.at ?? "") || bySurname(a, b));

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageTitle title="Messaggi">
        <p className="text-[15px] text-muted">Chat con i clienti: testo, foto e video. Il titolare vede tutte le conversazioni, il collaboratore quelle dei suoi clienti.</p>
      </PageTitle>
      <form>
        <label htmlFor="q" className="sr-only">Cerca un cliente</label>
        <Input id="q" name="q" defaultValue={q} placeholder="Cerca un cliente" className="max-w-sm" />
      </form>
      {rows.length === 0 ? (
        <EmptyState title="Nessun cliente">Aggiungi un cliente per iniziare a scrivergli.</EmptyState>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-[24px] bg-card">
          {rows.map((c) => (
            <li key={c.id} className="border-t border-sand-deep first:border-t-0">
              <Link href={`/staff/messaggi/${c.id}`} className="flex min-h-16 items-center gap-3 px-5 py-3 hover:bg-white">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sand text-sm font-bold">{c.first_name[0]}{c.last_name[0] ?? ""}</span>
                <span className="min-w-0 flex-1">
                  <span className={c.unread ? "block font-bold" : "block font-semibold"}>{c.first_name} {c.last_name}</span>
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
