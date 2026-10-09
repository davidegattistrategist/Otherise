"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { projectSchema } from "@/lib/project";
import { notify } from "@/lib/notify";
import type { Json } from "@/lib/supabase/database.types";

export type SaveProjectResult = { ok: true; message: string } | { ok: false; error: string };

export async function saveProject(clientId: string, raw: unknown, visible: boolean): Promise<SaveProjectResult> {
  const me = await requireStaff();
  const parsed = projectSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Progetto non valido." };
  const supabase = await createClient();
  const { data: before } = await supabase.from("client_projects").select("visible").eq("client_id", clientId).maybeSingle();
  const { error } = await supabase
    .from("client_projects")
    .upsert({ client_id: clientId, data: parsed.data as unknown as NonNullable<Json>, visible, updated_by: me.id }, { onConflict: "client_id" });
  if (error) return { ok: false, error: "Salvataggio non riuscito. Riprova." };
  // la prima volta che il progetto diventa visibile, il cliente riceve una notifica
  if (visible && !before?.visible) {
    const { data: c } = await supabase.from("clients").select("user_id").eq("id", clientId).maybeSingle();
    if (c?.user_id) {
      await notify([{ recipient_id: c.user_id, client_id: clientId, kind: "project", title: "Il tuo progetto è pronto", body: "Guarda come si susseguiranno le fasi nei prossimi mesi.", link: "/cliente/profilo#progetto", dedupe_key: `project:${clientId}` }]);
    }
  }
  revalidatePath(`/staff/clienti/${clientId}`, "layout");
  revalidatePath("/cliente/profilo");
  return { ok: true, message: visible ? "Progetto salvato: il cliente lo vede nel suo Percorso." : "Progetto salvato (il cliente non lo vede ancora)." };
}
