import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatShort } from "@/lib/dates";
import { parseContent } from "@/lib/program/types";
import { EmptyState, PageTitle, buttonClass } from "@/components/ui";
import { SubmitButton } from "@/components/form-bits";
import { createEmptyProgram } from "../programmi/actions";

export const metadata: Metadata = { title: "Modelli di programma" };

export default async function TemplatesPage() {
  await requireStaff();
  const supabase = await createClient();
  const { data: templates } = await supabase.from("programs").select("id, title, weeks, description, content, updated_at").eq("is_template", true).order("title");
  const create = createEmptyProgram.bind(null, null);
  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title="Modelli di programma"
        actions={
          <form action={create}>
            <SubmitButton pendingText="Creo…">Nuovo modello</SubmitButton>
          </form>
        }
      >
        <p className="max-w-prose text-[15px] text-muted">Programmi di partenza da assegnare a un cliente con un clic. Il cliente riceve una copia tutta sua: modificare il modello non cambia i programmi già assegnati.</p>
      </PageTitle>
      {templates?.length ? (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),1fr))]">
          {templates.map((t) => {
            const c = parseContent(t.content);
            const exercises = c.days.reduce((a, d) => a + d.blocks.reduce((b, bl) => b + bl.items.length, 0), 0);
            return (
              <Link key={t.id} href={`/staff/programmi/${t.id}`} className="flex flex-col gap-2 rounded-[24px] bg-card p-5 hover:bg-white">
                <span className="text-lg font-semibold">{t.title}</span>
                <span className="text-sm text-muted">{t.weeks} settimane · {c.days.length} giorni · {exercises} esercizi</span>
                {t.description ? <span className="line-clamp-2 text-sm text-ink-soft">{t.description}</span> : null}
                <span className="mt-auto pt-2 text-xs text-muted">Modificato il {formatShort(t.updated_at.slice(0, 10))}</span>
                <span className={buttonClass("secondary", "sm") + " self-start"}>Apri</span>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState title="Ancora nessun modello">Crea un modello da zero, oppure apri il programma di un cliente e usa “Salva come modello”.</EmptyState>
      )}
    </div>
  );
}
