import type { ReactNode } from "react";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="h-3 w-3 rounded-full bg-accent" aria-hidden="true" />
          <span className="text-lg font-bold tracking-tight">Otherise</span>
        </div>
        <h1 className="text-[32px] leading-tight font-normal tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-2 text-[15px] leading-relaxed text-muted">{subtitle}</p> : null}
        <div className="mt-8">{children}</div>
        <p className="mt-10 text-xs text-muted"><a href="/privacy" className="underline">Informativa privacy</a></p>
      </div>
    </main>
  );
}
