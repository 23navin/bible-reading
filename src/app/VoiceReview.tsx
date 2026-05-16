"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import {
  DiscardButton,
  ShareTargets,
  type ChatSummary,
  type Me,
  type ParsedPassage,
} from "./home-shared";

const VOICE_BUCKET = "audio-memos";

function stripReferencePrefix(text: string, ref: string): string {
  if (!text || !ref) return text;
  const trimmed = text.trimStart();
  if (!trimmed.toLowerCase().startsWith(ref.toLowerCase())) return text;
  const rest = trimmed.slice(ref.length).replace(/^[\s,;:.\-—–]+/, "");
  if (!rest) return "";
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

export default function VoiceReview({
  me,
  chats,
  blob,
  initialTranscript,
  initialPassage,
  liveTranscribing = false,
  onClose,
  exiting = false,
}: {
  me: Me;
  chats: ChatSummary[];
  blob: Blob;
  /** If provided, skip the Whisper fallback and use this transcript directly. */
  initialTranscript?: string | null;
  /** If provided, skip parse-passage and use this. */
  initialPassage?: ParsedPassage | null;
  /** True while the realtime session is still streaming finals after stop. */
  liveTranscribing?: boolean;
  onClose: () => void;
  exiting?: boolean;
}) {
  const hasRealtime = typeof initialTranscript === "string";
  const [supabase] = useState(() => createClient());
  const [transcript, setTranscript] = useState(() => {
    const t = initialTranscript ?? "";
    const ref = initialPassage?.reference ?? null;
    return ref ? stripReferencePrefix(t, ref) : t;
  });
  const [transcribing, setTranscribing] = useState(!hasRealtime);
  const [reference, setReference] = useState<string | null>(
    initialPassage?.reference ?? null,
  );
  const [passage, setPassage] = useState<ParsedPassage | null>(
    initialPassage ?? null,
  );

  // While the parent is still streaming the realtime transcript in,
  // mirror it into our editable state. Once liveTranscribing flips false,
  // we stop overwriting and the user can edit freely.
  useEffect(() => {
    if (!liveTranscribing) return;
    const t = initialTranscript ?? "";
    const ref = initialPassage?.reference ?? null;
    setTranscript(ref ? stripReferencePrefix(t, ref) : t);
    setReference(ref);
    setPassage(initialPassage ?? null);
  }, [liveTranscribing, initialTranscript, initialPassage]);
  const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playStartedAtCtxTimeRef = useRef(0);
  const offsetRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    audioCtxRef.current = ctx;
    (async () => {
      try {
        const arr = await blob.arrayBuffer();
        const decoded = await new Promise<AudioBuffer>((resolve, reject) => {
          ctx.decodeAudioData(arr.slice(0), resolve, reject);
        });
        if (cancelled) return;
        audioBufferRef.current = decoded;
      } catch (err) {
        console.error("audio decode failed", err);
        if (!cancelled) setError("Couldn't load audio for preview.");
      }
    })();
    return () => {
      cancelled = true;
      if (sourceRef.current) {
        try {
          sourceRef.current.stop();
        } catch {}
        sourceRef.current = null;
      }
      ctx.close().catch(() => {});
      audioCtxRef.current = null;
      audioBufferRef.current = null;
      offsetRef.current = 0;
    };
  }, [blob]);

  const togglePlay = async () => {
    const ctx = audioCtxRef.current;
    const buffer = audioBufferRef.current;
    if (!ctx || !buffer) return;
    if (sourceRef.current) {
      const elapsed = ctx.currentTime - playStartedAtCtxTimeRef.current;
      offsetRef.current = Math.min(offsetRef.current + elapsed, buffer.duration);
      try {
        sourceRef.current.stop();
      } catch {}
      sourceRef.current = null;
      setIsPlaying(false);
      return;
    }
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {}
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const offset = offsetRef.current >= buffer.duration ? 0 : offsetRef.current;
    source.start(0, offset);
    playStartedAtCtxTimeRef.current = ctx.currentTime;
    offsetRef.current = offset;
    sourceRef.current = source;
    setIsPlaying(true);
    source.onended = () => {
      if (sourceRef.current === source) {
        sourceRef.current = null;
        offsetRef.current = 0;
        setIsPlaying(false);
      }
    };
  };

  useEffect(() => {
    if (hasRealtime) return;
    let cancelled = false;
    (async () => {
      setTranscribing(true);
      try {
        const fd = new FormData();
        fd.append(
          "file",
          new File([blob], "memo.webm", { type: blob.type || "audio/webm" }),
        );
        const res = await fetch("/api/transcribe", { method: "POST", body: fd });
        if (!res.ok) throw new Error("transcribe failed");
        const { text } = (await res.json()) as { text: string };
        if (cancelled) return;
        setTranscript(text);

        if (text) {
          const pRes = await fetch("/api/parse-passage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          });
          if (pRes.ok) {
            const p = (await pRes.json()) as ParsedPassage;
            if (cancelled) return;
            setPassage(p);
            setReference(p.reference);
            if (p.reference) {
              const cleaned = stripReferencePrefix(text, p.reference);
              if (cleaned !== text) setTranscript(cleaned);
            }
          }
        }
      } catch {
        if (!cancelled)
          setError("Couldn't transcribe. You can still send the recording.");
      } finally {
        if (!cancelled) setTranscribing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blob, hasRealtime]);

  function toggleChat(id: string) {
    setSelectedChatIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send() {
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
            <button
              onClick={togglePlay}
              aria-label={isPlaying ? "Pause audio" : "Play audio"}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-zinc-100 active:scale-95"
            >
              {isPlaying ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
                  <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M8 5v14l12-7z" fill="currentColor" />
                </svg>
              )}
            </button>
            <input
              type="text"
              value={reference ?? ""}
              onChange={(e) => {
                setReference(e.target.value);
                setPassage(null);
              }}
              readOnly={liveTranscribing}
              placeholder="Passage Reference"
              className="min-w-0 flex-1 bg-transparent text-left text-sm font-semibold text-zinc-100 placeholder:text-zinc-500 outline-none"
            />
          </div>
          {transcribing ? (
            <p className="mt-2 text-sm text-zinc-400">Transcribing…</p>
          ) : (
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              readOnly={liveTranscribing}
              placeholder={liveTranscribing ? "Transcribing…" : "Your thoughts..."}
              rows={4}
              className="mt-2 w-full resize-none rounded-xl bg-transparent text-[15px] text-zinc-100 placeholder:text-zinc-500 outline-none"
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
            onClick={send}
            disabled={sending || transcribing || liveTranscribing}
            className="flex h-20 w-full items-center justify-center rounded-md bg-zinc-300 font-semibold text-zinc-800 active:bg-blue-500/10 disabled:opacity-50"
          >
            {sending
              ? "Logging…"
              : transcribing || liveTranscribing
                ? "Transcribing…"
                : "Log Reading"}
          </button>
        </div>
      </div>
    </div>
  );
}
