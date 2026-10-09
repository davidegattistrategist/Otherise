/**
 * Componenti di base dell'interfaccia. Lo stile vive qui: per cambiare
 * l'aspetto di tutti i pulsanti, le card o i campi basta modificare
 * questo file (e i colori in app/globals.css).
 */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Card({ className, dark, children, ...rest }: ComponentProps<"section"> & { dark?: boolean }) {
  return (
    <section
      className={cx(
        "rounded-[24px] p-5 sm:p-6",
        dark ? "bg-ink text-card" : "bg-card text-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </section>
  );
}

export function Eyebrow({ children, dark, className }: { children: ReactNode; dark?: boolean; className?: string }) {
  return <div className={cx("eyebrow", dark && "!text-muted-dark", className)}>{children}</div>;
}

type Variant = "primary" | "secondary" | "light" | "ghost" | "danger";

const variantClass: Record<Variant, string> = {
  primary: "bg-ink text-card hover:bg-black",
  secondary: "border-[1.5px] border-ink text-ink hover:bg-ink/5",
  light: "bg-card text-ink hover:bg-white",
  ghost: "text-ink hover:bg-ink/5",
  danger: "border-[1.5px] border-accent-deep text-accent-deep hover:bg-accent-soft/50",
};

export function buttonClass(variant: Variant = "primary", size: "md" | "sm" = "md") {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
    size === "md" ? "min-h-11 px-5 text-[15px]" : "min-h-9 px-4 text-sm",
    variantClass[variant],
  );
}

export function Button({ variant = "primary", size = "md", className, ...rest }: ComponentProps<"button"> & { variant?: Variant; size?: "md" | "sm" }) {
  return <button className={cx(buttonClass(variant, size), className)} {...rest} />;
}

export function LinkButton({ variant = "primary", size = "md", className, ...rest }: ComponentProps<typeof Link> & { variant?: Variant; size?: "md" | "sm" }) {
  return <Link className={cx(buttonClass(variant, size), className)} {...rest} />;
}

/** Pulsante "pillola" con cerchio arancio a destra (azione principale) */
export function ArrowCTA({ href, children, dark }: { href: string; children: ReactNode; dark?: boolean }) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex min-h-12 items-center gap-3.5 self-start rounded-full py-1.5 pr-1.5 pl-5 text-[15px] font-semibold",
        dark ? "bg-card text-ink" : "bg-ink text-card",
      )}
    >
      {children}
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-ink">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
      </span>
    </Link>
  );
}

const fieldBase =
  "w-full rounded-xl border border-sand-deep bg-sand px-3.5 py-2.5 text-base text-ink placeholder:text-muted/70 focus:border-ink focus:outline-none";

export function Label({ htmlFor, children, hint }: { htmlFor?: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-ink">
      {children}
      {hint ? <span className="ml-1.5 font-normal text-muted">{hint}</span> : null}
    </label>
  );
}

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cx(fieldBase, "min-h-11", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cx(fieldBase, "min-h-24 leading-relaxed", className)} {...rest} />;
}

export function Select({ className, ...rest }: ComponentProps<"select">) {
  return <select className={cx(fieldBase, "min-h-11 appearance-none bg-[length:16px] pr-9", className)} {...rest} />;
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <span className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
        {hint ? <span className="ml-1.5 font-normal text-muted">{hint}</span> : null}
      </span>
      {children}
    </div>
  );
}

export function Pill({ children, active, className }: { children: ReactNode; active?: boolean; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold", active ? "bg-ink text-card" : "bg-card text-ink", className)}>
      {children}
    </span>
  );
}

export function Dot({ tone = "ink", className }: { tone?: "ink" | "accent" | "muted" | "deep"; className?: string }) {
  const c = { ink: "bg-ink", accent: "bg-accent", muted: "bg-muted-dark", deep: "bg-accent-deep" }[tone];
  return <span aria-hidden="true" className={cx("inline-block h-2 w-2 shrink-0 rounded-full", c, className)} />;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "success"; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "rounded-2xl px-4 py-3 text-[15px] leading-relaxed",
        tone === "error" && "bg-accent-soft text-ink",
        tone === "success" && "bg-ink text-card",
        tone === "info" && "bg-sand-deep/60 text-ink",
      )}
    >
      {children}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[24px] border border-dashed border-sand-deep p-6">
      <div className="text-lg font-semibold">{title}</div>
      {children ? <div className="max-w-prose text-[15px] leading-relaxed text-muted">{children}</div> : null}
      {action}
    </div>
  );
}

export function ProgressBar({ value, dark }: { value: number; dark?: boolean }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cx("h-1.5 w-full rounded-full", dark ? "bg-line-dark" : "bg-sand-deep")} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-1.5 rounded-full bg-accent" style={{ width: `${v}%` }} />
    </div>
  );
}

/** Anello di avanzamento con percentuale al centro */
export function Ring({ value, size = 76, label }: { value: number; size?: number; label?: string }) {
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-sand-deep)" strokeWidth="6" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${(c * v) / 100} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[15px] font-semibold tabular">{label ?? `${Math.round(v)}%`}</div>
    </div>
  );
}

export function PageTitle({ eyebrow, title, children, actions }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <div className="text-[13px] text-muted">{eyebrow}</div> : null}
        <h1 className="mt-1 text-[32px] leading-tight font-normal tracking-tight sm:text-[40px]">{title}</h1>
        {children ? <div className="mt-2">{children}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2.5">{actions}</div> : null}
    </div>
  );
}

export function BigNumber({ value, unit, className }: { value: ReactNode; unit?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-baseline gap-1.5", className)}>
      <span className="text-[30px] leading-none font-light tracking-tight tabular">{value}</span>
      {unit ? <span className="text-sm text-muted">{unit}</span> : null}
    </div>
  );
}

export function SectionHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">{children}</h2>
      {action}
    </div>
  );
}

export function fmtNum(n: number | string | null | undefined, digits = 1): string {
  if (n === null || n === undefined || n === "") return "–";
  const v = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(v)) return "–";
  return v.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}
