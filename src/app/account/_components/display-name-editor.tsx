"use client";

import { useEffect, useRef } from "react";
import { setDisplayName } from "../_actions/set-display-name";

// Inline-editable display name: tap to edit, saves on blur / page close.
// Empty edits revert to the last saved name instead of persisting.
export function DisplayNameEditor({ initialName }: { initialName: string }) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const lastSaved = useRef(initialName);

  const commit = () => {
    const el = spanRef.current;
    if (!el) return;
    const name = (el.textContent ?? "").trim();
    if (!name) {
      el.textContent = lastSaved.current;
      return;
    }
    if (name === lastSaved.current) return;
    lastSaved.current = name;
    void setDisplayName(name);
  };

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") commit();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  });

  return (
    <span
      ref={spanRef}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-label="Display name"
      className="text-neutral-100 outline-none underline"
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    >
      {initialName}
    </span>
  );
}
