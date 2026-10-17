"use client";

/**
 * Navigazione dello staff sul telefono: barra in basso con le voci di tutti
 * i giorni e "Altro" che apre il resto del menu.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cx } from "./ui";
import { useLiveBadges } from "./staff-nav";
import { IconBell, IconBook, IconChat, IconMenu, IconSettings, IconTemplate, IconToday, IconUser, IconUsers, IconWallet, IconLogout, IconX } from "./icons";

const ICONS = { today: IconToday, users: IconUsers, chat: IconChat, template: IconTemplate, book: IconBook, wallet: IconWallet, team: IconUser, settings: IconSettings, bell: IconBell };
export type MobileItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number; exact?: boolean };

function isActive(path: string, it: MobileItem) {
  return it.exact ? path === it.href : path === it.href || path.startsWith(it.href + "/");
}

export function StaffMobileNav({ main: givenMain, more: givenMore, signOut, who }: { main: MobileItem[]; more: MobileItem[]; signOut: () => Promise<void>; who: string }) {
  const path = usePathname();
  const main = useLiveBadges(givenMain);
  const more = useLiveBadges(givenMore);
  const [open, setOpen] = useState(false);
  const [openedOn, setOpenedOn] = useState(path);
  if (openedOn !== path) {
    // cambio pagina: il menu si chiude
    setOpenedOn(path);
    setOpen(false);
  }
  const moreBadge = more.reduce((n, i) => n + (i.badge ?? 0), 0);
  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-40 bg-ink/30 lg:hidden" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-label="Menu"
            className="absolute inset-x-0 bottom-0 rounded-t-[28px] bg-sand px-4 pt-4 pb-[calc(var(--nav-space)+1rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between px-2">
              <span className="text-sm text-muted">{who}</span>
              <button type="button" aria-label="Chiudi menu" onClick={() => setOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-full bg-card"><IconX size={18} /></button>
            </div>
            <ul className="flex flex-col">
              {more.map((it) => {
                const Icon = ICONS[it.icon];
                return (
                  <li key={it.href}>
                    <Link href={it.href} className={cx("flex min-h-12 items-center gap-3 rounded-2xl px-3 text-[16px]", isActive(path, it) ? "bg-card font-bold" : "font-medium")}>
                      <Icon /> {it.label}
                      {it.badge ? <span className="ml-auto flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold text-white">{it.badge}</span> : null}
                    </Link>
                  </li>
                );
              })}
              <li className="mt-1 border-t border-sand-deep pt-1">
                <form action={signOut}>
                  <button type="submit" className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-[16px] font-medium text-muted"><IconLogout /> Esci</button>
                </form>
              </li>
            </ul>
          </div>
        </div>
      ) : null}
      <nav aria-label="Menu principale" data-bottom-nav="staff" className="fixed right-[var(--edge-right)] bottom-[var(--nav-gap)] left-[var(--edge-left)] z-50 rounded-[26px] bg-card/95 px-1.5 shadow-[0_10px_30px_-8px_rgba(27,26,23,0.28)] ring-1 ring-sand-deep/80 backdrop-blur lg:hidden">
        <ul className="flex justify-around py-1.5">
          {main.map((it) => {
            const Icon = ICONS[it.icon];
            const active = isActive(path, it);
            return (
              <li key={it.href} className="flex-1 px-0.5">
                <Link href={it.href} aria-current={active ? "page" : undefined} className={cx("relative flex min-h-[54px] flex-col items-center justify-center gap-0.5 rounded-[20px] text-[11.5px] font-semibold", active ? "bg-sand-deep/60 text-ink" : "text-muted")}>
                  <Icon size={23} />
                  {it.label}
                  {it.badge ? <span className="absolute top-1.5 left-1/2 ml-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">{it.badge}</span> : null}
                </Link>
              </li>
            );
          })}
          <li className="flex-1 px-0.5">
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={cx("relative flex min-h-[54px] w-full flex-col items-center justify-center gap-0.5 rounded-[20px] text-[11.5px] font-semibold", open ? "bg-sand-deep/60 text-ink" : "text-muted")}>
              <IconMenu size={23} />
              Altro
              {moreBadge ? <span className="absolute top-1.5 left-1/2 ml-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">{moreBadge}</span> : null}
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
