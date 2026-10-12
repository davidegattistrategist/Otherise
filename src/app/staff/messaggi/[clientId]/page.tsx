import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canUseChat, loadMessages, markChatRead } from "@/lib/chat";
import { ChatThread } from "@/components/chat/chat-thread";
import { IconArrowLeft } from "@/components/icons";
import { aiEnabled } from "@/lib/ai/claude";
import { readyChatDraft } from "@/lib/ai/reply";
import { getPtCounter, paymentReminderText, sessionsDueText } from "@/lib/data/billing";
import { ClearParams } from "@/components/clear-param";
import { markChatUnread } from "../actions";

export const metadata: Metadata = { title: "Chat" };

export default async function StaffChatPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ promemoria?: string }> }) {
  const { clientId } = await params;
  const { promemoria } = await searchParams;
  const me = await requireStaff();
  const supabase = await createClient();
  const client = await canUseChat(supabase, clientId);
  if (!client) notFound();
  const messages = await loadMessages(clientId, me);
  await markChatRead(supabase, me.id, clientId);
  const fromClient = Boolean(client.user_id) && messages.some((m) => !m.mine && !m.deleted);
  const draftsOn = aiEnabled() && Boolean(client.user_id);
  const draft = draftsOn ? await readyChatDraft(supabase, clientId) : null;
  // messaggio già scritto nel campo di testo (lo controlli e premi invio)
  const prefill =
    promemoria === "pagamento" && me.role === "owner"
      ? await paymentReminderText(supabase, clientId)
      : promemoria === "compleanno"
        ? `Tanti auguri ${client.first_name}! 🎉`
        : promemoria === "saluto"
          ? `Ciao ${client.first_name}! Come sta andando?`
          : promemoria === "sessioni" && me.role === "owner"
            ? await sessionsPrefill()
            : null;
  async function sessionsPrefill() {
    const extra = (await getPtCounter(supabase, clientId)).counter;
    return extra && extra.due > 0 ? sessionsDueText(client!.first_name, extra.due, extra.price) : null;
  }
  return (
    <div className="flex flex-col gap-3">
      {promemoria ? <ClearParams names={["promemoria"]} /> : null}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href="/staff/messaggi" className="flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"><IconArrowLeft size={16} /> Messaggi</Link>
          <h1 className="mt-1 truncate text-[28px] leading-tight font-normal tracking-tight">{client.first_name} {client.last_name}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          {fromClient ? (
            <form action={markChatUnread.bind(null, clientId)}>
              <button type="submit" className="min-h-10 text-sm font-semibold text-muted underline hover:text-ink">Segna da leggere</button>
            </form>
          ) : null}
          <Link href={`/staff/clienti/${clientId}`} className="text-sm font-semibold underline">Scheda</Link>
        </div>
      </div>
      {!client.user_id ? <p className="text-sm text-muted">Non ha ancora l&apos;app: leggerà i messaggi quando entrerà. Invitalo dalla scheda.{aiEnabled() ? " Le bozze di risposta dell'AI arrivano quando ti scrive dall'app." : ""}</p> : null}
      <ChatThread
        clientId={clientId}
        initial={messages}
        showSenderNames
        drafts={draftsOn ? { initial: draft, clientName: client.first_name } : undefined}
        prefill={prefill ?? undefined}
        emptyText="Ancora nessun messaggio. Puoi mandare testo, foto e video (per esempio un video dell'esecuzione)."
        className="h-[calc(100dvh-260px)] min-h-[420px] lg:h-[calc(100dvh-170px)]"
      />
    </div>
  );
}
