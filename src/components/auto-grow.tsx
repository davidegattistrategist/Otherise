"use client";

/**
 * Caselle di testo che crescono con il contenuto anche dove il CSS
 * `field-sizing: content` non c'è ancora (Safari su iPhone): così note,
 * indicazioni e messaggi si leggono interi, senza righe nascoste.
 * Una casella che deve restare della sua misura ha `data-no-autogrow`.
 */
import { useEffect } from "react";

export function AutoGrow() {
  useEffect(() => {
    if (typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content")) return;
    // misura solo quando cambia qualcosa (testo o larghezza)
    const seen = new WeakMap<HTMLTextAreaElement, string>();
    const fit = (el: EventTarget | null, force = false) => {
      if (!(el instanceof HTMLTextAreaElement) || el.dataset.noAutogrow !== undefined) return;
      const sig = `${el.value.length}:${el.value.slice(-20)}:${el.clientWidth}`;
      if (!force && seen.get(el) === sig) return;
      seen.set(el, sig);
      const cs = getComputedStyle(el);
      const max = parseFloat(cs.maxHeight) || Number.POSITIVE_INFINITY;
      const min = parseFloat(cs.minHeight) || 0;
      el.style.height = "auto";
      const h = el.scrollHeight + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
      el.style.height = `${Math.max(min, Math.min(h, max))}px`;
      el.style.overflowY = h > max ? "auto" : "hidden";
    };
    const all = () => document.querySelectorAll("textarea").forEach((t) => fit(t));
    const onInput = (e: Event) => fit(e.target, true);
    document.addEventListener("input", onInput, true);
    document.addEventListener("focusin", onInput, true);
    let raf = 0;
    const mo = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(all);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", all);
    // testo cambiato dall'app senza digitare (dettatura, bozze riprese)
    const timer = window.setInterval(all, 800);
    all();
    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("focusin", onInput, true);
      mo.disconnect();
      window.removeEventListener("resize", all);
      window.clearInterval(timer);
      cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
