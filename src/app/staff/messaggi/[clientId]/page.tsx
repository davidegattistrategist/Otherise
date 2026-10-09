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

export const metadata: Metadata = { title: "Chat" };

export default async function StaffChatPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const me = await requireStaff();
  const supabase = await createClient();
  const client = await canUseChat(supabase, clientId);
  if (!client) notFound();
  const messages = await loadMessages(clientId, me);
  await markChatRead(supabase, me.id, clientId);
  const { data: opt } = await supabase.from("clients").select("ai_opt_out").eq("id", clientId).maybeSingle();
  const draftsOn = aiEnabled() && !opt?.ai_opt_out && Boolean(client.user_id);
  const draft = draftsOn ? await readyChatDraft(supabase, clientId) : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href="/staff/messaggi" className="flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"><IconArrowLeft size={16} /> Messaggi</Link>
          <h1 className="mt-1 truncate text-[28px] leading-tight font-normal tracking-tight">{client.first_name} {client.last_name}</h1>
        </div>
        <Link href={`/staff/clienti/${clientId}`} className="shrink-0 text-sm font-semibold underline">Scheda</Link>
      </div>
      {!client.user_id ? <p className="text-sm text-muted">Non ha ancora l&apos;app: leggerà i messaggi quando entrerà. Invitalo dalla scheda.</p> : null}
      <ChatThread
        clientId={clientId}
        initial={messages}
        showSenderNames
        drafts={draftsOn ? { initial: draft } : undefined}
        emptyText="Ancora nessun messaggio. Puoi mandare testo, foto e video (per esempio un video dell'esecuzione)."
        className="h-[calc(100dvh-260px)] min-h-[420px] lg:h-[calc(100dvh-170px)]"
      />
    </div>
  );
}
