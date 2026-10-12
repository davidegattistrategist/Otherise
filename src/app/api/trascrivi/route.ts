/**
 * Dettatura: il telefono registra la voce e la manda qui, il server la
 * trascrive (Groq Whisper, lo stesso servizio dei vocali in chat) e
 * restituisce il testo. Funziona uguale su iPhone, Android e computer.
 * Staff e clienti con il percorso attivo. L'audio non viene salvato.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { transcribeAudio, transcriptionEnabled } from "@/lib/transcribe";

export const maxDuration = 60;

/** Sotto il limite di Vercel (4,5 MB): 4 minuti a 64 kbit/s sono circa 2 MB. */
const MAX_BYTES = 4_000_000;

const allowed = async () => {
  const me = await getMe();
  if (!me) return false;
  if (me.role === "owner" || me.role === "coach") return true;
  return me.role === "client" && Boolean(me.clientId) && me.clientStatus !== "archived";
};

export async function GET() {
  return NextResponse.json({ enabled: (await allowed()) && transcriptionEnabled() });
}

export async function POST(req: NextRequest) {
  if (!(await allowed())) return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  if (!transcriptionEnabled()) return NextResponse.json({ error: "La trascrizione non è attiva: manca la chiave GROQ_API_KEY su Vercel." }, { status: 400 });
  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || !audio.size) return NextResponse.json({ error: "Non è arrivato nessun audio. Riprova." }, { status: 400 });
  if (audio.size > MAX_BYTES) return NextResponse.json({ error: "Registrazione troppo lunga: dividila in due parti." }, { status: 413 });
  try {
    const text = await transcribeAudio(audio, audio.type || "audio/mp4");
    return NextResponse.json({ text });
  } catch (e) {
    console.error("dettatura", e);
    return NextResponse.json({ error: "La trascrizione non è riuscita. Riprova tra poco." }, { status: 502 });
  }
}
