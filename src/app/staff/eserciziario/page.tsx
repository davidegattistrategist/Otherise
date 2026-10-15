import { FilterSearch } from "@/components/filter-search";
import Link from "next/link";
import type { Metadata } from "next";
import { getExerciseLibrary } from "@/lib/data/cached";
import { requireStaff } from "@/lib/auth";
import { youtubeThumb } from "@/lib/import/exercises";
import { Card, Eyebrow, LinkButton, PageTitle } from "@/components/ui";
import { importBundledExercises, importExercisesCsv } from "./actions";
import { ImportPanel } from "./import-panel";

export const metadata: Metadata = { title: "Eserciziario" };

export default async function ExercisesPage({ searchParams }: { searchParams: Promise<{ q?: string; filtro?: string }> }) {
  await requireStaff();
  const { q = "", filtro } = await searchParams;
  const all = await getExerciseLibrary();
  // la ricerca filtra nel browser (FilterSearch), qui solo il filtro Tutti/Senza video/Nascosti
  const list = (all ?? [])
    .filter((e) => (filtro === "senza-video" ? !e.video_url && !e.archived : filtro === "nascosti" ? e.archived : !e.archived));
  const noVideo = (all ?? []).filter((e) => !e.video_url && !e.archived).length;

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Eserciziario" actions={<LinkButton href="/staff/eserciziario/nuovo">Nuovo esercizio</LinkButton>}>
        <p className="text-[15px] text-muted">{(all ?? []).length} esercizi{noVideo ? ` · ${noVideo} senza video` : ""}</p>
      </PageTitle>

      <form className="flex flex-wrap items-center gap-3" role="search">
        <FilterSearch target="elenco-esercizi" defaultValue={q} placeholder="Cerca un esercizio" label="Cerca esercizio" />
        <nav className="flex gap-3 text-sm font-semibold">
          <Link href="/staff/eserciziario" className={!filtro ? "underline underline-offset-4" : "text-muted"}>Tutti</Link>
          <Link href="/staff/eserciziario?filtro=senza-video" className={filtro === "senza-video" ? "underline underline-offset-4" : "text-muted"}>Senza video</Link>
          <Link href="/staff/eserciziario?filtro=nascosti" className={filtro === "nascosti" ? "underline underline-offset-4" : "text-muted"}>Nascosti</Link>
        </nav>
      </form>

      {list.length ? (
        <div id="elenco-esercizi">
        <p data-search-empty hidden className="text-[15px] text-muted">Nessun esercizio trovato.</p>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr))]">
          {list.map((e) => {
            const thumb = youtubeThumb(e.video_url);
            return (
              <Link key={e.id} href={`/staff/eserciziario/${e.id}`} data-search={`${e.name} ${e.category}`.toLowerCase()} className="flex gap-3 rounded-[20px] bg-card p-3 hover:bg-white">
                <div className="flex h-[64px] w-[96px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-sand-deep text-xs font-semibold text-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" /> : e.video_url ? "Video" : "Senza video"}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold leading-snug">{e.name}</div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-muted">{e.description || "Nessuna descrizione"}</div>
                </div>
              </Link>
            );
          })}
        </div>
        </div>
      ) : (
        <p className="text-[15px] text-muted">Nessun esercizio trovato.</p>
      )}

      <Card>
        <Eyebrow className="mb-4">Importa esercizi</Eyebrow>
        <ImportPanel csvAction={importExercisesCsv} bundledAction={importBundledExercises} empty={(all ?? []).length === 0} />
      </Card>
    </div>
  );
}
