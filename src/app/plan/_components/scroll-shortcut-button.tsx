"use client";

import { useEffect, useState } from "react";
import { ChevronDownIcon } from "@/components/icons";

// Floating shortcut for long plans: at the top of the page it jumps down to
// the most recently completed day (the element with id={targetId}); anywhere
// else it jumps back to the top. Hidden when neither jump would do anything.
export default function ScrollShortcutButton({ targetId }: { targetId: string | null }) {
  const [atTop, setAtTop] = useState(true);

  useEffect(() => {
    const update = () => setAtTop(window.scrollY < 100);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  if (atTop && !targetId) return null;

  const jump = () => {
    if (atTop) {
      document
        .getElementById(targetId!)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <button
      type="button"
      onClick={jump}
      aria-label={atTop ? "Scroll to most recently completed day" : "Scroll to top"}
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] right-6 flex h-11 w-11 items-center justify-center rounded-2xl bg-neutral-800 text-neutral-100 shadow-md shadow-black/40 active:bg-neutral-600"
    >
      <ChevronDownIcon className={`h-5 w-5${atTop ? "" : " rotate-180"}`} />
    </button>
  );
}
