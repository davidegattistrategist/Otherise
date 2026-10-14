"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cx, Dot } from "./ui";

type TabItem = { href: string; label: string; exact?: boolean; dot?: boolean };

/**
 * Schede di una sezione (es. la scheda cliente). Sul telefono scorrono di
 * lato: quella attiva viene portata in vista e una sfumatura ai bordi fa
 * capire che ce ne sono altre. Con `more` le schede usate meno stanno nel
 * menu "Altro" (quella aperta compare comunque tra le schede).
 */
export function Tabs({ items, more = [] }: { items: TabItem[]; more?: TabItem[] }) {
  const path = usePathname();
  const ref = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const [menu, setMenu] = useState(false);
  const isActive = (t: TabItem) => (t.exact ? path === t.href : path === t.href || path.startsWith(t.href + "/"));
  const activeMore = more.find(isActive);
  const shown = activeMore ? [...items, activeMore] : items;
  const rest = more.filter((t) => t !== activeMore);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as HTMLElement).closest("[data-tabs-more]")) setMenu(false);
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);

  const measure = () => {
    const el = ref.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>('[aria-current="page"]');
    if (active) {
      const left = active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2;
      el.scrollTo({ left: Math.max(0, left), behavior: "instant" as ScrollBehavior });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [path]);

  return (
    <div className="relative flex items-start gap-2">
      <div className="relative min-w-0 flex-1">
      <nav ref={ref} aria-label="Sezioni" onScroll={measure} className="scroll-x -mx-1 flex gap-2 px-1 pb-1">
        {shown.map((t) => {
          const active = isActive(t);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex min-h-10 shrink-0 items-center gap-2 rounded-full px-[18px] text-sm",
                active ? "bg-ink font-semibold text-card" : "bg-card font-medium text-ink hover:bg-white",
              )}
            >
              {t.label}
              {t.dot ? <Dot tone="accent" /> : null}
            </Link>
          );
        })}
      </nav>
      {edges.left ? <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 -left-1 w-8 bg-gradient-to-r from-sand to-transparent" /> : null}
      {edges.right ? <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 -right-1 w-10 bg-gradient-to-l from-sand to-transparent" /> : null}
      </div>
      {rest.length ? (
        <div className="relative shrink-0" data-tabs-more>
          <button
            type="button"
            aria-expanded={menu}
            aria-haspopup="menu"
            onClick={() => setMenu((m) => !m)}
            className={cx("flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium", menu ? "bg-ink text-card" : "bg-card text-ink hover:bg-white")}
          >
            Altro
            {rest.some((t) => t.dot) ? <Dot tone="accent" /> : null}
            <span aria-hidden="true" className={cx("text-xs transition-transform", menu && "rotate-180")}>▾</span>
          </button>
          {menu ? (
            <div role="menu" aria-label="Altre sezioni" className="absolute right-0 z-30 mt-2 flex min-w-48 flex-col rounded-2xl bg-card p-1.5 shadow-xl ring-1 ring-sand-deep">
              {rest.map((t) => (
                <Link key={t.href} role="menuitem" href={t.href} onClick={() => setMenu(false)} className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 text-[15px] hover:bg-sand">
                  {t.label}
                  {t.dot ? <Dot tone="accent" /> : null}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
