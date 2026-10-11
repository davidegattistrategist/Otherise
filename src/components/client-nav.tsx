"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";
import { useLiveCounts } from "./live";
import { IconCalendar, IconChart, IconChat, IconToday, IconUser } from "./icons";

const ITEMS = [
  { href: "/cliente", label: "Oggi", Icon: IconToday, exact: true },
  { href: "/cliente/programma", label: "Programma", Icon: IconCalendar, also: "/cliente/sessione" },
  { href: "/cliente/progressi", label: "Progressi", Icon: IconChart },
  { href: "/cliente/messaggi", label: "Chat", Icon: IconChat },
  { href: "/cliente/profilo", label: "Percorso", Icon: IconUser },
];

/** Percorso terminato: restano solo la chat e l'account. */
const ENDED_ITEMS = [
  { href: "/cliente/messaggi", label: "Chat", Icon: IconChat, exact: false, also: undefined },
  { href: "/cliente/profilo", label: "Account", Icon: IconUser, exact: false, also: undefined },
];

export function ClientNav({ chatUnread: initialChats = 0, ended = false }: { chatUnread?: number; ended?: boolean }) {
  const path = usePathname();
  const chatUnread = useLiveCounts({ notifications: 0, chats: initialChats }).chats;
  // durante l'allenamento sul telefono il menu sparisce: lo schermo serve al logbook
  const inSession = path.startsWith("/cliente/sessione/");
  return (
    <nav
      aria-label="Menu"
      className={cx(
        // telefono: barra staccata dal fondo e dai bordi arrotondati dello schermo
        "fixed right-[var(--edge-right)] bottom-[var(--nav-gap)] left-[var(--edge-left)] z-30 rounded-[26px] bg-card/95 px-1.5 shadow-[0_10px_30px_-8px_rgba(27,26,23,0.28)] ring-1 ring-sand-deep/80 backdrop-blur",
        "md:static md:block md:rounded-none md:bg-transparent md:px-0 md:shadow-none md:ring-0",
        inSession && "hidden",
      )}
    >
      <ul className="mx-auto flex max-w-xl justify-around py-1.5 md:max-w-none md:justify-start md:gap-1 md:py-0">
        {(ended ? ENDED_ITEMS : ITEMS).map(({ href, label, Icon, exact, also }) => {
          const active = exact ? path === href : path.startsWith(href) || (also ? path.startsWith(also) : false);
          return (
            <li key={href} className="flex-1 px-0.5 md:flex-none md:px-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-[54px] flex-col items-center justify-center gap-0.5 rounded-[20px] text-[11.5px] font-semibold md:min-h-10 md:flex-row md:gap-2 md:rounded-full md:px-4 md:text-sm",
                  active ? "bg-sand-deep/60 text-ink md:bg-card" : "text-muted hover:text-ink",
                )}
              >
                <span className="relative">
                  <Icon size={23} />
                  {href === "/cliente/messaggi" && chatUnread > 0 ? (
                    <span className="absolute -top-1.5 -right-2.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">{chatUnread}</span>
                  ) : null}
                </span>
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
