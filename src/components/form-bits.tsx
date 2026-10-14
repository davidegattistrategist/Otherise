"use client";

import { useFormStatus } from "react-dom";
import { buttonClass, cx, Notice } from "./ui";
import type { ReactNode } from "react";

/** Pulsante di invio che si disattiva mentre il modulo viene salvato */
export function SubmitButton({
  children,
  pendingText = "Salvataggio…",
  variant = "primary",
  size = "md",
  className,
  name,
  value,
  formAction,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "light" | "ghost" | "danger";
  size?: "md" | "sm";
  className?: string;
  name?: string;
  value?: string;
  formAction?: (fd: FormData) => void | Promise<void>;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} formAction={formAction} disabled={pending} className={cx(buttonClass(variant, size), className)}>
      {pending ? pendingText : children}
    </button>
  );
}

export type ActionState = { ok?: boolean; error?: string; message?: string } | null;

export function ActionMessage({ state }: { state: ActionState }) {
  if (!state) return null;
  if (state.error) return <Notice tone="error">{state.error}</Notice>;
  if (state.message) return <Notice tone="success">{state.message}</Notice>;
  return null;
}

/** Chiede conferma prima di inviare (per eliminare) */
export function ConfirmButton({ children, message, className, variant = "danger", size = "sm", label, plain }: { children: ReactNode; message: string; className?: string; variant?: "danger" | "ghost" | "secondary"; size?: "md" | "sm"; label?: string; plain?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={label}
      className={plain ? className : cx(buttonClass(variant, size), className)}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {pending ? "…" : children}
    </button>
  );
}
