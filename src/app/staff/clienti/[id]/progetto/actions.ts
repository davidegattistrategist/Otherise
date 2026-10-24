"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { projectSchema } from "@/lib/project";
import { notify } from "@/lib/notify";
import type { Json } from "@/lib/supabase/database.types";

export type SaveProjectResult = { ok: true; message: string; updated_at: string } | { ok: false; error: string; conflict?: boolean };

/**
 * Salva il progetto. La notifica al cliente parte solo se il trainer lo sceglie
 * nella finestra che si apre al salvataggio (e solo se il progetto è visibile).
 */
export async function saveProject(clientId: string, raw: unknown, visible: boolean, notifyClient = false, expectedUpdatedAt: string | null = null): Promise<SaveProjectResult> {
  const me = await requireStaff();
  const parsed = projectSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Progetto non valido." };
  const supabase = await createClient();
  const { data: before } = await supabase.from("client_projects").select("visible, updated_at").eq("client_id", clientId).maybeSingle();
  // salvato altrove nel frattempo (altro dispositivo, collaboratore): non si sovrascrive alla cieca
  if (before && expectedUpdatedAt !== null && before.updated_at !== expectedUpdatedAt) {
    return { ok: false, conflict: true, error: "Il progetto è stato modificato da un altro dispositivo nel frattempo. Ricarica la pagina: le modifiche fatte qui ti verranno riproposte." };
  }
  const { data: saved, error } = await supabase
    .from("client_projects")
    .upsert({ client_id: clientId, data: parsed.data as unknown as NonNullable<Json>, visible, updated_by: me.id }, { onConflict: "client_id" })
    .select("updated_at")
    .single();
  if (error || !saved) return { ok: false, error: "Salvataggio non riuscito. Riprova." };
  let notified = false;
  if (visible && notifyClient) {
    const { data: c } = await supabase.from("clients").select("user_id").eq("id", clientId).maybeSingle();
    if (c?.user_id) {
      const first = !before?.visible;
      await notify([{
        recipient_id: c.user_id,
        client_id: clientId,
        kind: "project",
        title: first ? "Il tuo progetto è pronto" : "Il tuo progetto è stato aggiornato",
        body: first ? "Guarda come si susseguiranno le fasi nei prossimi mesi." : "Guarda le novità nel tuo Percorso.",
        link: "/cliente/profilo#progetto",
        dedupe_key: `project:${clientId}:${Date.now()}`,
      }]);
      notified = true;
    }
  }
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
  revalidatePath("/cliente/profilo");
  return {
    ok: true,
    updated_at: saved.updated_at,
    message: !visible ? "Progetto salvato (il cliente non lo vede ancora)." : notified ? "Progetto salvato e cliente avvisato con una notifica." : "Progetto salvato: il cliente lo vede nel suo Percorso.",
  };
}
