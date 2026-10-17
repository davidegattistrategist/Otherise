"use client";

/**
 * Casella delle note che sul telefono, toccandola, si apre a tutto schermo:
 * scrivi (o detti) comodo, e con "Fatto" torni al modulo. Il testo va subito
 * nella casella vera (come se lo scrivessi lì), quindi si salva da solo come
 * il resto del modulo. Sul computer è una casella normale.
 */
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { createPortal, flushSync } from "react-dom";
import { DictateButton } from "./dictate-button";
import { Textarea } from "./ui";

const setNative = (el: HTMLTextAreaElement, v: string) => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

const isPhone = () => {
  try {
    return window.matchMedia("(max-width: 767px)").matches;
  } catch {
    return false;
  }
};

export function NoteArea({ title, ref, onClick, plain, ...rest }: ComponentProps<"textarea"> & { title: string; plain?: boolean }) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const big = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const textRef = useRef("");
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);

  // altezza visibile sopra la tastiera (così "Fatto" e il testo restano in vista)
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    const fit = () => setBox(vv ? { top: vv.offsetTop, height: vv.height } : { top: 0, height: window.innerHeight });
    fit();
    vv?.addEventListener("resize", fit);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      vv?.removeEventListener("resize", fit);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const write = (v: string) => {
    textRef.current = v;
    setText(v);
    if (inner.current) setNative(inner.current, v);
  };
  const close = () => {
    setOpen(false);
    inner.current?.blur();
  };

  return (
    <>
      <Textarea
        {...rest}
        ref={(el) => {
          inner.current = el;
          if (typeof ref === "function") ref(el);
          else if (ref) ref.current = el;
        }}
        onClick={(e) => {
          onClick?.(e);
          if (plain || open || rest.readOnly || rest.disabled || !isPhone()) return;
          const value = e.currentTarget.value;
          textRef.current = value;
          flushSync(() => {
            setText(value);
            setOpen(true);
          });
          const el = big.current;
          if (el) {
            el.focus();
            el.setSelectionRange(value.length, value.length);
          }
        }}
      />
      {open
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={title}
              className="fixed inset-x-0 top-0 z-[95] flex flex-col bg-card pt-[env(safe-area-inset-top)]"
              style={box ? { top: box.top, height: box.height } : { height: "100dvh" }}
            >
              <div className="flex items-center justify-between gap-2 border-b border-sand-deep px-4 py-2.5">
                <span className="min-w-0 truncate text-[15px] font-semibold">{title}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <DictateButton onText={(t) => write(textRef.current ? `${textRef.current.trimEnd()} ${t}` : t)} />
                  <button type="button" onClick={close} className="min-h-10 rounded-full bg-ink px-5 text-[15px] font-semibold text-card">
                    Fatto
                  </button>
                </div>
              </div>
              <textarea
                ref={big}
                aria-label={title}
                value={text}
                placeholder={rest.placeholder}
                onChange={(e) => write(e.target.value)}
                data-no-autogrow
                className="w-full flex-1 resize-none bg-card px-4 py-3 text-[17px] leading-relaxed outline-none"
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
