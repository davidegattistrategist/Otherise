"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";
import { IconBell, IconBook, IconChat, IconSettings, IconTemplate, IconToday, IconUsers, IconWallet, IconUser } from "./icons";

const ICONS = { today: IconToday, users: IconUsers, chat: IconChat, template: IconTemplate, book: IconBook, wallet: IconWallet, team: IconUser, settings: IconSettings, bell: IconBell };

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number; exact?: boolean };

export function StaffNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Menu" className="flex flex-row flex-wrap gap-1 lg:flex-col">
      {items.map((it) => {
        const Icon = ICONS[it.icon];
        const active = it.exact ? path === it.href : path === it.href || path.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex min-h-11 items-center gap-3 rounded-2xl px-3 text-[15px]",
              active ? "bg-card font-bold text-ink" : "font-medium text-muted hover:bg-card/60 hover:text-ink",
            )}
          >
            <Icon />
            <span>{it.label}</span>
            {it.badge ? (
              <span className="ml-auto flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-ink px-1.5 text-xs font-bold text-card">{it.badge}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
