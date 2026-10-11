/**
 * Scheletro mostrato subito quando si cambia pagina (loading.tsx), mentre i
 * dati arrivano dal server: il tocco ha effetto immediato e il menu resta fermo.
 */
export function PageSkeleton({ cards = 3, title = true }: { cards?: number; title?: boolean }) {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-busy="true" aria-label="Caricamento">
      {title ? (
        <>
          <div className="mt-1 h-3.5 w-28 rounded-full bg-sand-deep/80" />
          <div className="h-9 w-3/5 rounded-2xl bg-sand-deep/80" />
        </>
      ) : null}
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-[24px] bg-card p-5">
          <div className="h-3 w-24 rounded-full bg-sand-deep/70" />
          <div className="h-5 w-4/5 rounded-full bg-sand-deep/70" />
          <div className="h-4 w-2/3 rounded-full bg-sand-deep/50" />
          {i === 0 ? <div className="mt-2 h-12 rounded-full bg-sand-deep/50" /> : null}
        </div>
      ))}
    </div>
  );
}
