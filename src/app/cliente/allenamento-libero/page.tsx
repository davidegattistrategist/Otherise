import type { Metadata } from "next";
import { requireActiveClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatShort, todayISO } from "@/lib/dates";
import { freeKindLabel, freeWorkoutDetail, isFreeKind } from "@/lib/free-workout";
import { Card, Eyebrow } from "@/components/ui";
import { IconTrash } from "@/components/icons";
import { FreeWorkoutForm } from "./free-form";
import { deleteFreeWorkout, repeatFreeWorkout } from "./actions";

export const metadata: Metadata = { title: "Allenamento libero" };

export default async function FreeWorkoutPage() {
  const me = await requireActiveClient();
  const supabase = await createClient();
  const today = todayISO();
  const { data: list } = await supabase
    .from("free_workouts")
    .select("id, performed_on, kind, minutes, effort, notes")
    .eq("client_id", me.clientId)
    .order("performed_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(15);
  const last = list?.[0] && isFreeKind(list[0].kind) ? { kind: list[0].kind, minutes: list[0].minutes, effort: list[0].effort } : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[30px] leading-tight font-normal tracking-tight">Allenamento libero</h1>
        <p className="mt-1 text-[15px] text-muted">Pesi per conto tuo, spinning, una corsa, una partita: segnalo in pochi secondi, così il tuo coach sa tutto quello che fai.{last ? " Ci sono già le scelte dell'ultima volta." : ""}</p>
      </div>
      <Card>
        <FreeWorkoutForm today={today} last={last} />
      </Card>

      {list?.length ? (
        <div className="flex flex-col gap-2">
          <Eyebrow className="px-1">Gli ultimi</Eyebrow>
          <Card className="flex flex-col !py-2">
            {list.map((w) => (
              <div key={w.id} className="flex items-center gap-3 border-t border-sand-deep py-3 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{freeKindLabel(w.kind)}{freeWorkoutDetail(w) ? <span className="font-normal text-muted"> · {freeWorkoutDetail(w)}</span> : null}</div>
                  <div className="text-sm text-muted">{w.performed_on === today ? "Oggi" : formatShort(w.performed_on)}{w.notes ? ` · ${w.notes}` : ""}</div>
                </div>
                <form action={repeatFreeWorkout.bind(null, w.id)}>
                  <button type="submit" className="min-h-10 shrink-0 rounded-full bg-sand px-3.5 text-sm font-semibold">Rifallo oggi</button>
                </form>
                <form action={deleteFreeWorkout.bind(null, w.id)}>
                  <button type="submit" aria-label={`Togli ${freeKindLabel(w.kind)} del ${formatShort(w.performed_on)}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-sand">
                    <IconTrash size={18} />
                  </button>
                </form>
              </div>
            ))}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
