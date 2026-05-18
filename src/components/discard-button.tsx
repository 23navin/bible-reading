"use client";

import { useEffect, useState } from "react";
import { CloseIcon } from "./icons";

export function DiscardButton({ onDiscard }: { onDiscard: () => void }) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(id);
  }, [confirming]);

  return (
    <button
      type="button"
      onClick={() => {
        if (confirming) onDiscard();
        else setConfirming(true);
      }}
      aria-label={confirming ? "Confirm discard" : "Discard"}
      style={{ borderRadius: 8 }}
      className={`flex h-10 shrink-0 items-center justify-center border transition-all duration-200 ease-out ${
        confirming
          ? "w-24 border-red-500 bg-red-500 text-white"
          : "w-10 border-zinc-700 bg-zinc-800 text-zinc-300 active:bg-zinc-700"
      }`}
    >
      {confirming ? (
        <span className="text-sm font-semibold leading-none">Discard</span>
      ) : (
        <CloseIcon className="h-5 w-5" />
      )}
    </button>
  );
}
