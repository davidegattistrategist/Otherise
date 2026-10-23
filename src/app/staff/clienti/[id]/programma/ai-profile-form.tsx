"use client";

import { LiveForm } from "@/components/live-form";
import { DictateButton } from "@/components/dictate-button";
import { useState } from "react";
import type { ActionState } from "@/components/form-bits";
import { Label, Select, Textarea, Input } from "@/components/ui";
import type { AiProfile } from "@/lib/ai-profile";

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;

/** Indicazioni per l'AI sul cliente: livello, tempo, spinte verticali, gambe, tecniche di intensità. */
export function AiProfileForm({ action, values, actualSquat }: { action: Action; values: AiProfile; actualSquat: number | null }) {
  const [auto, setAuto] = useState(values.squat_share === null);
  const [share, setShare] = useState(values.squat_share ?? actualSquat ?? 50);
  const tech = values.intensity_techniques === null ? "" : values.intensity_techniques ? "si" : "no";
  return (
    <LiveForm action={action} name="indicazioni-ai" className="flex flex-col gap-4">
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
        <div>
          <Label htmlFor="ai-minutes" hint="minuti">Tempo per seduta</Label>
          <Input id="ai-minutes" name="session_minutes" type="number" inputMode="numeric" min={15} max={240} step={5} defaultValue={values.session_minutes ?? ""} placeholder="es. 75" />
        </div>
        <div>
          <Label htmlFor="ai-strength">Livello forza</Label>
          <Select id="ai-strength" name="strength_level" defaultValue={values.strength_level ?? ""}>
            <option value="">Non indicato</option>
            <option value="principiante">Principiante</option>
            <option value="intermedio">Intermedio</option>
            <option value="avanzato">Avanzato</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="ai-run">Livello corsa</Label>
          <Select id="ai-run" name="running_level" defaultValue={values.running_level ?? ""}>
            <option value="">Non indicato</option>
            <option value="nessuno">Non corre</option>
            <option value="principiante">Principiante</option>
            <option value="intermedio">Intermedio</option>
            <option value="avanzato">Avanzato</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="ai-vertical">Spinte verticali</Label>
          <Select id="ai-vertical" name="vertical_push" defaultValue={values.vertical_push ?? ""}>
            <option value="">Segui il programma</option>
            <option value="si">Sì</option>
            <option value="poche">Poche</option>
            <option value="no">No (spalle rigide, cifosi…)</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="ai-tech">Tecniche di intensità</Label>
          <Select id="ai-tech" name="intensity_techniques" defaultValue={tech}>
            <option value="">Decido io volta per volta</option>
            <option value="si">Sì, concordate</option>
            <option value="no">No</option>
          </Select>
        </div>
      </div>

      <fieldset className="rounded-2xl bg-sand/70 px-4 py-3">
        <legend className="sr-only">Gambe: accosciata o hinge</legend>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold">Gambe: accosciata o hinge</span>
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" name="squat_auto" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-5 w-5 accent-[#1b1a17]" />
            Segui il programma
          </label>
        </div>
        {auto ? (
          <p className="mt-1 text-sm text-muted">
            L&apos;AI mantiene il bilanciamento del programma attuale{actualSquat !== null ? ` (ora ${actualSquat}% accosciata, ${100 - actualSquat}% hinge)` : ""}.
          </p>
        ) : (
          <div className="mt-2">
            <input aria-label="Percentuale di accosciata" type="range" name="squat_share" min={0} max={100} step={10} value={share} onChange={(e) => setShare(Number(e.target.value))} className="w-full accent-[#e2622a]" />
            <div className="mt-1 flex justify-between text-sm font-semibold tabular">
              <span>Accosciata {share}%</span>
              <span>Hinge {100 - share}%</span>
            </div>
          </div>
        )}
      </fieldset>

      <div>
        <div className="flex items-end justify-between gap-2"><Label htmlFor="ai-notes" hint="facoltativo">Altre indicazioni per l&apos;AI</Label><DictateButton targetId="ai-notes" /></div>
        <Textarea id="ai-notes" name="notes" rows={3} defaultValue={values.notes} placeholder="es. In palestra ha solo manubri fino a 30 kg; preferisce non correre sul tapis roulant" />
      </div>
      <fieldset className="rounded-2xl bg-sand/70 px-4 py-3" data-limitation>
        <legend className="sr-only">Limitazione temporanea</legend>
        <div className="flex items-end justify-between gap-2"><Label htmlFor="ai-limitation" hint="facoltativa">Limitazione temporanea</Label><DictateButton targetId="ai-limitation" /></div>
        <Textarea id="ai-limitation" name="limitation" rows={2} defaultValue={values.limitation} placeholder="es. Distorsione al polso sinistro: niente prese con la mano sinistra" />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label htmlFor="ai-limitation-until" className="text-sm font-semibold">Fino al</label>
          <Input id="ai-limitation-until" name="limitation_until" type="date" defaultValue={values.limitation_until ?? ""} className="!w-auto" />
          <span className="text-sm text-muted">Poi l&apos;AI smette di tenerne conto da sola.</span>
        </div>
      </fieldset>
      <div>
        <Label htmlFor="ai-reply" hint="una per riga">Come scrivergli in chat</Label>
        <Textarea id="ai-reply" name="reply_lessons" rows={3} defaultValue={values.reply_lessons} placeholder="Si riempie da solo quando correggi le bozze di risposta. Puoi anche scriverlo tu: es. La chiamo Giuly; con lei niente emoji" />
      </div>
    </LiveForm>
  );
}
