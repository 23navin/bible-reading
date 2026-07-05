"use client";

import { useState } from "react";
import { createClient } from "@/lib/db/client";
import { DiscardButton } from "@/components/discard-button";
import { ShareTargets } from "@/components/share-targets";
import { applyReferenceReplacement, type ParsedPassage } from "@/lib/passage";
import type { ChatSummary, Me } from "@/lib/types";

export default function TextComposer({
  me,
  chats,
  onClose,
  exiting = false,
}: {
  me: Me;
  chats: ChatSummary[];
  onClose: () => void;
  exiting?: boolean;
}) {
  const [supabase] = useState(() => createClient());
  const [text, setText] = useState("");
  const [reference, setReference] = useState<string | null>(null);
  const [passage, setPassage] = useState<ParsedPassage | null>(null);
  const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleChat(id: string) {
    setSelectedChatIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function parse() {
    if (!text.trim()) return;
    try {
      const res = await fetch("/api/passages/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const p = (await res.json()) as ParsedPassage;
        if (p.reference) {
          setPassage(p);
          setReference(p.reference);
        }
      }
    } catch {}
  }

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    try {
      const note = applyReferenceReplacement(text, passage);
      const { data: inserted, error: insErr } = await supabase
        .from("messages")
        .insert({
          user_id: me.id,
          note,
          voice_path: null,
          transcript: null,
          reference,
          book: passage?.book ?? null,
          chapter: passage?.chapter ?? null,
          verse_start: passage?.verse_start ?? null,
          verse_end: passage?.verse_end ?? null,
          created_tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
        .select("id")
        .single();
      if (insErr || !inserted) throw insErr ?? new Error("insert failed");

      if (selectedChatIds.size > 0) {
        const shareRows = Array.from(selectedChatIds).map((chat_id) => ({
          message_id: inserted.id,
          chat_id,
          shared_by: me.id,
        }));
        const { error: shareErr } = await supabase
          .from("message_shares")
          .insert(shareRows);
        if (shareErr) throw shareErr;
      }

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
    <div
      className={`absolute inset-0 z-30 flex flex-col bg-zinc-900 text-zinc-100 ${
        exiting ? "screen-fade-out" : "screen-fade-in"
      }`}
    >
      <header className="flex items-center justify-end px-8 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <DiscardButton onDiscard={onClose} />
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pb-4">
        <div className="rounded-2xl bg-zinc-800 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-700 font-mono text-base italic text-zinc-100"
            >
              t
            </span>
            <input
              type="text"
              value={reference ?? ""}
              onChange={(e) => {
                setReference(e.target.value);
                setPassage(null);
              }}
              placeholder="Passage Reference"
              className="min-w-0 flex-1 bg-transparent text-left text-sm font-semibold text-zinc-100 placeholder:text-zinc-500 outline-none"
            />
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={parse}
            placeholder="Your thoughts..."
            rows={4}
            className="mt-2 w-full resize-none bg-transparent text-[15px] text-zinc-100 placeholder:text-zinc-500 outline-none"
          />
        </div>

        <ShareTargets
          chats={chats}
          selected={selectedChatIds}
          onToggle={toggleChat}
        />

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <div className="mt-auto flex gap-2 pt-2">
          <button
            onClick={send}
            disabled={sending || !text.trim()}
            className="flex h-20 w-full items-center justify-center rounded-md bg-zinc-300 font-semibold text-zinc-800 active:bg-blue-500/10 disabled:opacity-50"
          >
            {sending ? "Logging…" : "Log Reading"}
          </button>
        </div>
      </div>
    </div>
  );
}
