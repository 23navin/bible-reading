"use client";

import Link from "next/link";
import { ViewTransition, useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase";

const VOICE_BUCKET = "audio-memos";

export type Member = { id: string; display_name: string | null };
export type ChatSummary = {
  id: string;
  name: string;
  members: Member[];
  hasUnread: boolean;
};
export type Me = {
  id: string;
  username: string | null;
  display_name: string | null;
};

type Mode = "idle" | "voice" | "text";
type VoiceStage = "recording" | "review";

type ParsedPassage = {
  book: string | null;
  chapter: number | null;
  verse_start: number | null;
  verse_end: number | null;
  reference: string | null;
};

const VOICE_MORPH_NAME = "composer-voice";
const TEXT_MORPH_NAME = "composer-text";

export default function HomeView({ me, chats }: { me: Me; chats: ChatSummary[] }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [, startTransition] = useTransition();

  const openVoice = () => startTransition(() => setMode("voice"));
  const openText = () => startTransition(() => setMode("text"));
  const closeOverlay = () => startTransition(() => setMode("idle"));

  const displayName = me.display_name ?? me.username ?? "friend";

  return (
    <main className="flex h-full flex-col bg-zinc-900 text-zinc-100">
      <header className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="text-white">{displayName}</span>'s Reading Log
        </h1>
        <Link
          href="/archive"
          aria-label="Open your archive"
          className="rounded-full ring-1 ring-zinc-700 active:ring-zinc-500"
        >
          <Avatar name={displayName} id={me.id} size={40} />
        </Link>
      </header>

      <section className="flex-1 overflow-y-auto px-4">
        {chats.length === 0 ? (
          <p className="mt-16 text-center text-sm text-zinc-500">
            No chats yet. Tap “new chat” below to start one.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 py-4">
            {chats.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/chat/${c.id}`}
                  className="flex items-center gap-3 rounded-xl px-2 py-2 active:bg-zinc-800"
                >
                  <UnreadDot active={c.hasUnread} />
                  <span className="text-lg text-zinc-100">{c.name}</span>
                  <AvatarStack members={c.members} />
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/chats/new"
                className="flex items-center gap-3 rounded-xl px-2 py-2 text-zinc-400 active:bg-zinc-800"
              >
                <UnreadDot active={false} />
                <span className="text-lg">new chat</span>
              </Link>
            </li>
          </ul>
        )}
      </section>

      {mode === "idle" ? (
        <nav className="grid grid-cols-3 gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          <ViewTransition name={VOICE_MORPH_NAME} share="composer-morph">
            <div className="col-span-2">
              <button
                type="button"
                onClick={openVoice}
                aria-label="Record voice log"
                className="flex h-20 w-full items-center justify-center rounded-md border border-red-500 bg-transparent active:bg-red-500/10"
              >
                <span aria-hidden className="block h-6 w-6 rounded-full bg-red-500" />
              </button>
            </div>
          </ViewTransition>
          <ViewTransition name={TEXT_MORPH_NAME} share="composer-morph">
            <div>
              <button
                type="button"
                onClick={openText}
                aria-label="Type a log"
                className="flex h-20 w-full items-center justify-center rounded-md border border-dashed border-zinc-400 bg-transparent text-zinc-100 active:bg-zinc-800"
              >
                <span aria-hidden className="font-serif text-3xl italic lowercase leading-none">
                  t
                </span>
              </button>
            </div>
          </ViewTransition>
        </nav>
      ) : null}

      {mode === "voice" ? (
        <VoiceComposer me={me} chats={chats} onClose={closeOverlay} />
      ) : null}
      {mode === "text" ? (
        <TextComposer me={me} chats={chats} onClose={closeOverlay} />
      ) : null}
    </main>
  );
}

function UnreadDot({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={`h-2 w-2 shrink-0 rounded-full ${
        active ? "bg-blue-500" : "bg-transparent"
      }`}
    />
  );
}

function AvatarStack({ members }: { members: Member[] }) {
  const shown = members.slice(0, 4);
  const overflow = members.length - shown.length;
  return (
    <div className="ml-1 flex items-center">
      {shown.map((m, i) => (
        <div
          key={m.id}
          style={{
            marginLeft: i === 0 ? 0 : -10,
            zIndex: shown.length - i,
          }}
          className="ring-2 ring-zinc-900 rounded-full"
        >
          <Avatar name={m.display_name ?? "?"} id={m.id} size={28} />
        </div>
      ))}
      {overflow > 0 ? (
        <div
          style={{ marginLeft: -10, zIndex: 0 }}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-700 text-[10px] font-semibold text-zinc-200 ring-2 ring-zinc-900"
        >
          +{overflow}
        </div>
      ) : null}
    </div>
  );
}

function Avatar({
  name,
  id,
  size,
}: {
  name: string;
  id: string;
  size: number;
}) {
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();
  const bg = avatarColor(id);
  return (
    <div
      style={{ width: size, height: size, backgroundColor: bg, fontSize: size * 0.42 }}
      className="flex items-center justify-center rounded-full font-semibold text-white select-none"
    >
      {initial}
    </div>
  );
}

const AVATAR_PALETTE = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // amber
  "#22c55e", // green
  "#14b8a6", // teal
  "#0ea5e9", // sky
  "#6366f1", // indigo
  "#a855f7", // purple
  "#ec4899", // pink
];
function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" />
    </svg>
  );
}
function TextIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M5 4h14v2h-6v14h-2V6H5V4Z" />
    </svg>
  );
}
function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden>
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
function StopIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

// ---------- Voice composer ----------

function VoiceComposer({
  me,
  chats,
  onClose,
}: {
  me: Me;
  chats: ChatSummary[];
  onClose: () => void;
}) {
  const [supabase] = useState(() => createClient());
  const [stage, setStage] = useState<VoiceStage>("recording");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [transcript, setTranscript] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [passage, setPassage] = useState<ParsedPassage | null>(null);
  const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);

  const runTranscribe = async (b: Blob) => {
    setTranscribing(true);
    try {
      const fd = new FormData();
      fd.append("file", new File([b], "memo.webm", { type: b.type || "audio/webm" }));
      const res = await fetch("/api/transcribe", { method: "POST", body: fd });
      if (!res.ok) throw new Error("transcribe failed");
      const { text } = (await res.json()) as { text: string };
      setTranscript(text);

      if (text) {
        const pRes = await fetch("/api/parse-passage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (pRes.ok) {
          const p = (await pRes.json()) as ParsedPassage;
          setPassage(p);
          setReference(p.reference);
        }
      }
    } catch {
      setError("Couldn't transcribe. You can still send the recording.");
    } finally {
      setTranscribing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const rec = new MediaRecorder(stream);
        chunksRef.current = [];
        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          if (cancelledRef.current) return;
          const b = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
          setBlob(b);
          setStage("review");
          void runTranscribe(b);
        };
        rec.start();
        recorderRef.current = rec;
      } catch {
        if (!cancelled) setError("Microphone access denied.");
      }
    })();
    return () => {
      cancelled = true;
      cancelledRef.current = true;
      const rec = recorderRef.current;
      recorderRef.current = null;
      if (rec && rec.state !== "inactive") rec.stop();
    };
  }, []);

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
  }

  function toggleChat(id: string) {
    setSelectedChatIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send() {
    if (!blob) return;
    setSending(true);
    setError(null);
    try {
      const ext = blob.type.includes("mp4") ? "m4a" : "webm";
      const path = `${me.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(VOICE_BUCKET)
        .upload(path, blob, { contentType: blob.type });
      if (upErr) throw upErr;

      const { data: inserted, error: insErr } = await supabase
        .from("messages")
        .insert({
          user_id: me.id,
          note: null,
          voice_path: path,
          transcript: transcript || null,
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
        const { error: shareErr } = await supabase.from("message_shares").insert(shareRows);
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
    <ViewTransition name={VOICE_MORPH_NAME} share="composer-morph">
      <div className="absolute inset-0 z-30 flex flex-col bg-zinc-900 text-zinc-100">
        <header className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
          <button
            onClick={() => {
              cancelledRef.current = true;
              onClose();
            }}
            aria-label="Close"
            className="rounded-full p-2 active:bg-zinc-800"
          >
            <CloseIcon className="h-6 w-6 text-zinc-300" />
          </button>
          <span className="text-sm font-medium text-zinc-400">
            {stage === "recording" ? "Recording…" : "Review"}
          </span>
          <span className="w-10" />
        </header>

        {stage === "recording" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6">
            <div className="h-32 w-32 animate-pulse rounded-full bg-red-500/20" />
            <button
              onClick={stopRecording}
              aria-label="Stop recording"
              className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500 text-white shadow-lg active:scale-95"
            >
              <StopIcon className="h-8 w-8" />
            </button>
            <p className="text-sm text-zinc-400">Tap to stop</p>
          </div>
        ) : null}

        {stage === "review" && blob ? (
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pb-4">
            <audio
              controls
              src={URL.createObjectURL(blob)}
              className="h-10 w-full"
            />
            <div className="rounded-2xl bg-zinc-800 p-4">
              {reference ? (
                <div className="mb-2 inline-flex rounded-full bg-zinc-700 px-3 py-1 text-sm font-semibold text-zinc-100">
                  {reference}
                </div>
              ) : null}
              {transcribing ? (
                <p className="text-sm text-zinc-400">Transcribing…</p>
              ) : (
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="Transcript will appear here"
                  rows={4}
                  className="w-full resize-none rounded-xl bg-transparent text-[15px] text-zinc-100 placeholder:text-zinc-500 outline-none"
                />
              )}
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
                disabled={sending}
                className="flex-[2] rounded-xl bg-blue-500 px-4 py-3 font-semibold text-white active:bg-blue-600 disabled:opacity-50"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        ) : null}

        {stage === "recording" && error ? (
          <p className="px-5 pb-4 text-center text-sm text-red-400">{error}</p>
        ) : null}
      </div>
    </ViewTransition>
  );
}

// ---------- Text composer ----------

function TextComposer({
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
        const { error: shareErr } = await supabase.from("message_shares").insert(shareRows);
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
    <ViewTransition name={TEXT_MORPH_NAME} share="composer-morph">
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
    </ViewTransition>
  );
}

function ShareTargets({
  chats,
  selected,
  onToggle,
}: {
  chats: ChatSummary[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
        Also share to
      </p>
      {chats.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No chats yet — this will save to your archive only.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {chats.map((c) => {
            const on = selected.has(c.id);
            return (
              <button
                key={c.id}
                onClick={() => onToggle(c.id)}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  on
                    ? "border-blue-500 bg-blue-500 text-white"
                    : "border-zinc-700 bg-zinc-800 text-zinc-200"
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      )}
      <p className="mt-2 text-xs text-zinc-500">
        {selected.size === 0
          ? "Saves to your archive only."
          : `Saves to archive + ${selected.size} chat${selected.size === 1 ? "" : "s"}.`}
      </p>
    </div>
  );
}
