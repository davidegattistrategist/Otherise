"use client";

import { useState, type ComponentProps } from "react";
import { Input } from "./ui";

/**
 * Campo password con "Mostra" accanto: sul telefono si sbaglia alla cieca e
 * "Password dimenticata" diventava la strada abituale.
 */
export function PasswordInput(props: Omit<ComponentProps<"input">, "type">) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pr-24" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-pressed={show}
        aria-controls={props.id}
        className="absolute inset-y-0 right-1 my-auto flex h-10 items-center rounded-full px-3 text-sm font-semibold text-ink-soft hover:text-ink"
      >
        {show ? "Nascondi" : "Mostra"}
      </button>
    </div>
  );
}
