"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";
import { IconCalendar, IconChart, IconToday, IconUser } from "./icons";

const ITEMS = [
  { href: "/cliente", label: "Oggi", Icon: IconToday, exact: true },
  { href: "/cliente/programma", label: "Programma", Icon: IconCalendar, also: "/cliente/sessione" },
  { href: "/cliente/progressi", label: "Progressi", Icon: IconChart },
  { href: "/cliente/profilo", label: "Percorso", Icon: IconUser },
];

export function ClientNav() {
  const path = usePathname();
  return (
    <nav aria-label="Menu" className="fixed inset-x-0 bottom-0 z-30 border-t border-sand-deep bg-sand/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:static md:border-0 md:bg-transparent md:pb-0">
      <ul className="mx-auto flex max-w-xl justify-around md:max-w-none md:justify-start md:gap-1">
        {ITEMS.map(({ href, label, Icon, exact, also }) => {
          const active = exact ? path === href : path.startsWith(href) || (also ? path.startsWith(also) : false);
          return (
            <li key={href} className="flex-1 md:flex-none">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold md:min-h-10 md:flex-row md:gap-2 md:rounded-full md:px-4 md:text-sm",
                  active ? "text-ink md:bg-card" : "text-muted hover:text-ink",
                )}
              >
                <Icon size={22} />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
