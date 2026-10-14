"use client";

/**
 * Spostarsi tra le misure senza toccare lo schermo ogni volta:
 * - sul computer: Invio o freccia → (a fine numero) passa alla misura dopo,
 *   freccia ← (a inizio numero) a quella prima, ↑ ↓ nella tabella delle pliche
 *   cambiano riga;
 * - sul telefono: sopra la tastiera compare una barra con ‹ › e il nome della
 *   misura, così si compilano pliche e centimetri uno dopo l'altro.
 * I campi che partecipano hanno l'attributo data-nav (e data-nav-label).
 */
import { useEffect, useState, type RefObject } from "react";
import { IconArrowLeft, IconArrowRight } from "./icons";

const fields = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLInputElement>("input[data-nav]")).filter((el) => !el.disabled && el.offsetParent !== null);

function move(root: HTMLElement, from: HTMLInputElement, step: number) {
  const list = fields(root);
  const i = list.indexOf(from);
  const next = list[i + step];
  if (!next) return false;
  next.focus();
  next.select();
  next.scrollIntoView({ block: "center", behavior: "smooth" });
  return true;
}

/** Stessa colonna, riga sopra o sotto (tabella delle pliche). */
function moveRow(root: HTMLElement, from: HTMLInputElement, step: number) {
  const col = from.dataset.navCol;
  const row = Number(from.dataset.navRow);
  if (col === undefined || !Number.isFinite(row)) return false;
  const target = root.querySelector<HTMLInputElement>(`input[data-nav-col="${col}"][data-nav-row="${row + step}"]`);
  if (!target) return false;
  target.focus();
  target.select();
  return true;
}

export function FieldNav({ root }: { root: RefObject<HTMLElement | null> }) {
  const [current, setCurrent] = useState<HTMLInputElement | null>(null);
  // la barra serve solo con il dito (sul computer bastano Invio e frecce)
  const [touch] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  const [bottom, setBottom] = useState(0);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onFocus = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement && t.dataset.nav !== undefined) setCurrent(t);
    };
    const onBlur = (e: FocusEvent) => {
      // passando da una misura all'altra la barra resta
      const next = e.relatedTarget as HTMLElement | null;
      if (!(next instanceof HTMLInputElement && next.dataset.nav !== undefined)) setTimeout(() => setCurrent((c) => (document.activeElement === c ? c : null)), 120);
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (!(t instanceof HTMLInputElement) || t.dataset.nav === undefined) return;
      const atEnd = t.selectionStart === t.value.length && t.selectionEnd === t.value.length;
      const atStart = t.selectionStart === 0 && t.selectionEnd === 0;
      if (e.key === "Enter") {
        e.preventDefault();
        move(el, t, e.shiftKey ? -1 : 1);
      } else if (e.key === "ArrowRight" && atEnd) {
        if (move(el, t, 1)) e.preventDefault();
      } else if (e.key === "ArrowLeft" && atStart) {
        if (move(el, t, -1)) e.preventDefault();
      } else if (e.key === "ArrowDown") {
        if (moveRow(el, t, 1)) e.preventDefault();
      } else if (e.key === "ArrowUp") {
        if (moveRow(el, t, -1)) e.preventDefault();
      }
    };
    el.addEventListener("focusin", onFocus);
    el.addEventListener("focusout", onBlur);
    el.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("focusin", onFocus);
      el.removeEventListener("focusout", onBlur);
      el.removeEventListener("keydown", onKey);
    };
  }, [root]);

  // sul telefono la barra sta appena sopra la tastiera
  useEffect(() => {
    if (!touch || !current || !window.visualViewport) return;
    const vv = window.visualViewport;
    const place = () => setBottom(Math.max(0, window.innerHeight - (vv.offsetTop + vv.height)));
    place();
    vv.addEventListener("resize", place);
    vv.addEventListener("scroll", place);
    return () => {
      vv.removeEventListener("resize", place);
      vv.removeEventListener("scroll", place);
    };
  }, [touch, current]);

  if (!touch || !current || !root.current) return null;
  const list = fields(root.current);
  const i = list.indexOf(current);
  const go = (step: number) => {
    if (root.current) move(root.current, current, step);
  };
  // pointerdown senza perdere il fuoco: la tastiera resta aperta
  const keep = (e: React.PointerEvent) => e.preventDefault();
  return (
    <div className="fixed inset-x-0 z-[90] flex items-center gap-2 border-t border-sand-deep bg-card/95 px-3 py-2 backdrop-blur" style={{ bottom }} role="toolbar" aria-label="Spostati tra le misure">
      <button type="button" onPointerDown={keep} onClick={() => go(-1)} disabled={i <= 0} className="flex h-11 w-12 items-center justify-center rounded-full bg-sand disabled:opacity-40" aria-label="Misura prima">
        <IconArrowLeft size={20} />
      </button>
      <span className="min-w-0 flex-1 truncate text-center text-sm font-semibold">{current.dataset.navLabel ?? ""}</span>
      <button type="button" onPointerDown={keep} onClick={() => go(1)} disabled={i < 0 || i >= list.length - 1} className="flex h-11 w-12 items-center justify-center rounded-full bg-ink text-card disabled:opacity-40" aria-label="Misura dopo">
        <IconArrowRight size={20} />
      </button>
    </div>
  );
}
