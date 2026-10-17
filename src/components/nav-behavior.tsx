"use client";

/**
 * Menu in basso sul telefono, come Instagram e WhatsApp:
 * - scorrendo verso il basso si rimpicciolisce un po' (più spazio alla
 *   pagina); appena torni su o ti fermi torna normale;
 * - mentre scrivi (tastiera aperta) sparisce del tutto.
 * Niente stato React: due attributi su <html> (`data-nav-small`,
 * `data-typing`) e il resto lo fa il CSS (globals.css), solo trasformazioni,
 * quindi la pagina non si ridisegna.
 */
import { useEffect } from "react";

const NOT_TYPING = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "file", "color", "image", "hidden"]);

/** Un campo che apre la tastiera. */
export function opensKeyboard(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly;
  if (el instanceof HTMLInputElement) return !NOT_TYPING.has(el.type) && !el.readOnly;
  return el instanceof HTMLElement && el.isContentEditable;
}

export function NavBehavior() {
  useEffect(() => {
    // solo sui telefoni (dito, non mouse)
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const html = document.documentElement;
    const set = (name: string, on: boolean) => {
      if (on) html.setAttribute(name, "");
      else html.removeAttribute(name);
    };

    // tastiera aperta
    let blurTimer: ReturnType<typeof setTimeout> | undefined;
    const onFocusIn = (e: FocusEvent) => {
      clearTimeout(blurTimer);
      if (opensKeyboard(e.target as Element)) set("data-typing", true);
    };
    const onFocusOut = () => {
      clearTimeout(blurTimer);
      // passando da un campo all'altro il menu non deve lampeggiare
      blurTimer = setTimeout(() => set("data-typing", opensKeyboard(document.activeElement)), 120);
    };

    // scorrimento: di qualsiasi riquadro (anche la lista della chat)
    const last = new WeakMap<EventTarget, number>();
    let small = false;
    let idle: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    let pending: EventTarget | null = null;
    const shrink = (on: boolean) => {
      if (on === small) return;
      small = on;
      set("data-nav-small", on);
    };
    const check = () => {
      frame = 0;
      const t = pending;
      pending = null;
      if (!t) return;
      const el = t === document ? document.scrollingElement : (t as Element);
      if (!el) return;
      const y = el.scrollTop;
      const prev = last.get(t) ?? y;
      last.set(t, y);
      const dy = y - prev;
      if (dy > 6 && y > 40) shrink(true);
      else if (dy < -4 || y <= 40) shrink(false);
      // fermo per un attimo: torna normale
      clearTimeout(idle);
      if (small) idle = setTimeout(() => shrink(false), 700);
    };
    const onScroll = (e: Event) => {
      pending = e.target;
      if (!frame) frame = requestAnimationFrame(check);
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    if (opensKeyboard(document.activeElement)) set("data-typing", true);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("scroll", onScroll, { capture: true });
      clearTimeout(blurTimer);
      clearTimeout(idle);
      if (frame) cancelAnimationFrame(frame);
      set("data-typing", false);
      set("data-nav-small", false);
    };
  }, []);
  return null;
}
