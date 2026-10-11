import type { Metadata } from "next";
import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadMessages, markChatRead } from "@/lib/chat";
import { ChatThread } from "@/components/chat/chat-thread";

export const metadata: Metadata = { title: "Chat" };

export default async function ClientChatPage() {
  const me = await requireClient();
  const supabase = await createClient();
  const [messages, { data: coach }] = await Promise.all([loadMessages(me.clientId, me), supabase.rpc("my_coach_name"), markChatRead(supabase, me.id, me.clientId)]);
  return (
    <div className="flex flex-col gap-3">
      <h1 className="truncate text-[28px] leading-tight font-normal tracking-tight">Chat con {coach ?? "il tuo coach"}</h1>
      {me.clientStatus === "archived" ? (
        <p className="text-sm leading-snug text-muted">Il percorso è terminato: qui puoi scrivere quando vuoi, anche per ripartire insieme.</p>
      ) : null}
      <ChatThread
        clientId={me.clientId}
        initial={messages}
        showSenderNames
        emptyText={me.clientStatus === "archived" ? "Scrivi qui per qualsiasi cosa: un dato, un consiglio, un nuovo programma." : "Scrivi qui per domande sul programma. Puoi mandare anche foto e video, per esempio un esercizio di cui non sei sicuro."}
        className={me.clientStatus === "archived" ? "h-[calc(100dvh-300px)] min-h-[340px] md:h-[calc(100dvh-270px)]" : "h-[calc(100dvh-230px)] min-h-[380px] md:h-[calc(100dvh-210px)]"}
      />
    </div>
  );
}
