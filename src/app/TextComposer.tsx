"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import {
  CloseIcon,
  ShareTargets,
  type ChatSummary,
  type Me,
  type ParsedPassage,
} from "./home-shared";

export default function TextComposer({
  me,
  chats,
  onClose,
}: {
  me: Me;
  chats: ChatSummary[];
  onClose: () => void;
}) {
  const [supabase] = useState(() => createClient());
  const [text, setText] = useState("");
  const [reference, setReference] = useState<string | null>(null);
  const [passage, setPassage] = useState<ParsedPassage | null>(null);
  const [parsing, setParsing] = useState(false);
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
    setParsing(true);
    try {
      const res = await fetch("/api/parse-passage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const p = (await res.json()) as ParsedPassage;
        setPassage(p);
        setReference(p.reference);
      }
    } finally {
      setParsing(false);
    }
  }

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    try {
      const { data: inserted, error: insErr } = await supabase
        .from("messages")
        .insert({
          user_id: me.id,
          note: text,
          voice_path: null,
          transcript: null,
          reference,
          book: passage?.book ?? null,
          chapter: passage?.chapter ?? null,
          verse_start: passage?.verse_start ?? null,
          verse_end: passage?.verse_end ?? null,
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
    <div className="absolute inset-0 z-30 flex flex-col bg-zinc-900 text-zinc-100">
      <header className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-2 active:bg-zinc-800"
        >
          <CloseIcon className="h-6 w-6 text-zinc-300" />
        </button>
        <span className="text-sm font-medium text-zinc-400">Write a log</span>
        <span className="w-10" />
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pb-4">
        <div className="rounded-2xl bg-zinc-800 p-4">
          {reference ? (
            <div className="mb-2 inline-flex rounded-full bg-zinc-700 px-3 py-1 text-sm font-semibold text-zinc-100">
              {reference}
            </div>
          ) : null}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={parse}
            placeholder="What did you read today?"
            rows={8}
            autoFocus
            className="w-full resize-none rounded-xl bg-transparent text-[15px] text-zinc-100 placeholder:text-zinc-500 outline-none"
          />
          {parsing ? (
            <p className="text-xs text-zinc-500">Looking for a passage reference…</p>
          ) : null}
        </div>

        <ShareTargets
          chats={chats}
          selected={selectedChatIds}
          onToggle={toggleChat}
        />

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <div className="mt-auto flex gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={sending}
            className="flex-1 rounded-xl bg-zinc-800 px-4 py-3 font-medium text-zinc-200 active:bg-zinc-700 disabled:opacity-50"
          >
            Discard
          </button>
          <button
            onClick={send}
            disabled={sending || !text.trim()}
            className="flex-[2] rounded-xl bg-blue-500 px-4 py-3 font-semibold text-white active:bg-blue-600 disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
