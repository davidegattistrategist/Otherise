"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx, Dot } from "./ui";

export function Tabs({ items }: { items: Array<{ href: string; label: string; exact?: boolean; dot?: boolean }> }) {
  const path = usePathname();
  return (
    <nav aria-label="Sezioni" className="scroll-x -mx-1 flex gap-2 px-1 pb-1">
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
  );
}
