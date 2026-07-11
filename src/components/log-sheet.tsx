"use client";

import { DiscardButton } from "@/components/discard-button";
import { ShareTargets } from "@/components/share-targets";
import type { ChatSummary } from "@/lib/types";

// Full-screen log overlay shared by VoiceReview and TextComposer: discard
// header, scrollable body (children = the reference/text card), share
// targets, error line, and the big Log button.
export function LogSheet({
  exiting = false,
  onClose,
  chats,
  selected,
  onToggle,
  error,
  submitLabel,
  submitDisabled,
  onSubmit,
  children,
}: {
  exiting?: boolean;
  onClose: () => void;
  chats: ChatSummary[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  error: string | null;
  submitLabel: string;
  submitDisabled: boolean;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`absolute inset-0 z-30 flex flex-col bg-neutral-900 text-neutral-100 ${
        exiting ? "screen-fade-out" : "screen-fade-in"
      }`}
    >
      <header className="flex items-center justify-end px-8 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <DiscardButton onDiscard={onClose} />
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pb-4">
        {children}
        <ShareTargets chats={chats} selected={selected} onToggle={onToggle} />
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <div className="mt-auto flex gap-2 pt-2">
          <button
            onClick={onSubmit}
            disabled={submitDisabled}
            className="flex h-20 w-full items-center justify-center rounded-md bg-neutral-300 font-semibold text-neutral-800 active:bg-blue-500/10 disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
