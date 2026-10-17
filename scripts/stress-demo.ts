/**
 * Testi LUNGHI sui dati di prova, per controllare che niente esca dallo
 * schermo o dalle card (nomi di esercizi posturali, corse con ritmi, note
 * lunghe, link senza spazi…). Da lanciare DOPO scripts/seed-demo.ts, solo su
 * un database di prova, poi `node scripts/layout-audit.mjs`. I test e2e
 * vogliono i dati normali: dopo il controllo rifai il seed.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/stress-demo.ts
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import { newId, parseContent, type ProgramBlock } from "../src/lib/program/types";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Servono SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error("Solo su un database di prova in locale");
const db = createClient<Database>(url, key, { auth: { persistSession: false } });

const LONG_RUN = "3x1500m progressive da 4:50 a 4:30 al km, recupero 2' camminando";
const LONG_POSTURE = "Respirazione diaframmatica supina con piedi al muro e palloncino";
const LONG_NOTE = "Mandami un video o i dati se vuoi che riguardiamo i ritmi. Se tieni il passo con facilità, resta in controllo senza forzare.";
const LINK = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabcdefghijklmnopqrstuvwxyz0123456789ABCDEFG&index=12";

const single = (name: string, rx: string, weeks: number, rest = "", notes = ""): ProgramBlock => ({
  id: newId(), kind: "single", title: "", notes: "", rounds: null, durationMin: null, everySec: null, workSec: null, restSec: null,
  items: [{ id: newId(), exerciseId: null, name, rest, notes, prescriptions: Array(weeks).fill(rx) }],
});

async function main() {
  const { data: programs } = await db.from("programs").select("id, title, weeks, content");
  for (const p of programs ?? []) {
    const c = parseContent(p.content);
    c.days.forEach((d, i) => {
      if (i === 0) d.title = `${d.title} · corsa, ripetute e fartlek con richiamo della forza`;
      d.blocks.push(
        single("Corsa, ripetute e fartlek", LONG_RUN, p.weeks, "90\" camminando piano tra le serie", LONG_NOTE),
        {
          id: newId(), kind: "superset", title: "", notes: "Recupero 60\" a fine coppia, poi ripeti senza fretta", rounds: 3, durationMin: null, everySec: null, workSec: null, restSec: null,
          items: [
            { id: newId(), exerciseId: null, name: LONG_POSTURE, rest: "", notes: "Espira tutta l'aria, coste in basso", prescriptions: Array(p.weeks).fill("2x8 respiri lenti per lato") },
            { id: newId(), exerciseId: null, name: "Step Ups laterale - corpo libero con fermo in alto", rest: "60\"", notes: "", prescriptions: Array(p.weeks).fill("4x10/12 per lato") },
          ],
        },
      );
    });
    await db.from("programs").update({ title: p.title.length < 40 ? `${p.title} · preparazione beach volley e corsa` : p.title, content: c as unknown as never }).eq("id", p.id).throwOnError();
  }
  // nomi, obiettivi, note e messaggi lunghi
  const { data: clients } = await db.from("clients").select("id, last_name");
  for (const cl of clients ?? []) {
    await db.from("clients").update({ last_name: `${cl.last_name} De Santis-Martinelli`, goals: `${LONG_NOTE} ${LONG_NOTE}` }).eq("id", cl.id).throwOnError();
  }
  const { data: giulia } = await db.from("clients").select("id, user_id").eq("email", "giulia@prova.local").single();
  if (giulia?.user_id) {
    await db.from("messages").insert([
      { client_id: giulia.id, sender_id: giulia.user_id, body: `Guarda questo: ${LINK} e dimmi se va bene come esecuzione` },
      { client_id: giulia.id, sender_id: giulia.user_id, body: "Superlunghissimaparolasenzaspazicheunclientepotrebbescrivereperscherzoopersbaglio!!!!!" },
    ]).throwOnError();
  }
  await db.from("exercises").insert({ name: `${LONG_POSTURE} (variante con elastico)`, description: LONG_NOTE, video_url: LINK }).throwOnError();
  const { data: checks } = await db.from("checks").select("id").limit(3);
  for (const ch of checks ?? []) await db.from("checks").update({ notes_next_phase: `${LONG_NOTE} ${LINK}`, tests_text: `Squat 5RM 80kg; corsa 3000m in 13:40; ${LONG_POSTURE}` }).eq("id", ch.id);
  const { data: pays } = await db.from("payments").select("id").limit(5);
  for (const pa of pays ?? []) await db.from("payments").update({ notes: `Bonifico ricevuto in due parti: ${LONG_NOTE}` }).eq("id", pa.id);
  console.log("Dati lunghi pronti.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
