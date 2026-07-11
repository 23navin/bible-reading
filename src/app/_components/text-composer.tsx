"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/db/client";
import { insertLogWithShares } from "@/lib/db/insert-log";
import { LogSheet } from "@/components/log-sheet";
import { useShareTargets } from "@/components/share-targets";
import { parseReferenceInput } from "@/lib/passage";
import type { ChatSummary, Me } from "@/lib/types";

export default function TextComposer({
  me,
  chats,
  initialReference = null,
  onClose,
  exiting = false,
}: {
  me: Me;
  chats: ChatSummary[];
  /** Prefilled passage reference (from a plan-day deep link). */
  initialReference?: string | null;
  onClose: () => void;
  exiting?: boolean;
}) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [text, setText] = useState("");
  const [reference, setReference] = useState<string | null>(initialReference);
  const { selectedChatIds, toggleChat } = useShareTargets();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!text.trim()) return;
    // The reference comes only from the reference field — the note body is
    // never parsed (and never leaves the device except as the note itself).
    const checked = parseReferenceInput(reference ?? "");
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    const passage = checked.passage;
    setReference(passage.reference); // show the normalized form
    setSending(true);
    setError(null);
    try {
      await insertLogWithShares(
        supabase,
        {
          userId: me.id,
          note: text,
          transcript: null,
          voicePath: null,
          passage,
        },
        selectedChatIds,
      );

      // The insert's DB trigger may have marked a plan day complete, so
      // re-fetch the server-rendered next reading (and chat timestamps).
      router.refresh();
      onClose();
    } catch (err) {
      console.error("send failed", err);
      const msg = err instanceof Error ? err.message : "Couldn't send.";
      setError(msg);
    } finally {
      setSending(false);
    }
  }

  return (
    <LogSheet
      exiting={exiting}
      onClose={onClose}
      chats={chats}
      selected={selectedChatIds}
      onToggle={toggleChat}
      error={error}
      submitLabel={sending ? "Logging…" : "Log Reading"}
      submitDisabled={sending || !text.trim()}
      onSubmit={send}
    >
      <div className="rounded-2xl bg-neutral-800 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20"
          >
            <span className="translate-x-[-0.5px] font-mono text-base italic text-white">
              t
            </span>
          </span>
          <input
            type="text"
            value={reference ?? ""}
            onChange={(e) => {
              setReference(e.target.value);
              setError(null);
            }}
            placeholder="Passage Reference"
            className="min-w-0 flex-1 bg-transparent text-left text-sm font-semibold text-neutral-100 placeholder:text-neutral-500 outline-none"
          />
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Your thoughts..."
          rows={6}
          className="mt-2 w-full resize-none bg-transparent text-[15px] text-neutral-100 placeholder:text-neutral-500 outline-none"
        />
      </div>
    </LogSheet>
  );
}
