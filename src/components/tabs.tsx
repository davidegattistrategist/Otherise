"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cx, Dot } from "./ui";

/**
 * Schede di una sezione (es. la scheda cliente). Sul telefono scorrono di
 * lato: quella attiva viene portata in vista e una sfumatura ai bordi fa
 * capire che ce ne sono altre.
 */
export function Tabs({ items }: { items: Array<{ href: string; label: string; exact?: boolean; dot?: boolean }> }) {
  const path = usePathname();
  const ref = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

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
    <div className="relative">
      <nav ref={ref} aria-label="Sezioni" onScroll={measure} className="scroll-x -mx-1 flex gap-2 px-1 pb-1">
        {items.map((t) => {
          const active = t.exact ? path === t.href : path === t.href || path.startsWith(t.href + "/");
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
  );
}
