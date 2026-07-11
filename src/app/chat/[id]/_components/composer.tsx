"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/db/client";
import { insertLogWithShares, uploadVoiceBlob, voiceExtension } from "@/lib/db/insert-log";
import { useVoiceRecorder } from "@/lib/audio/use-voice-recorder";
import { applyReferenceReplacement, type ParsedPassage } from "@/lib/passage";
import type { Message } from "@/lib/types";

type Props = {
  chatId: string;
  currentUserId: string;
  onOptimistic: (m: Message) => void;
  onReconcile: (optimisticId: string, realId: string) => void;
  replyTarget: Message | null;
};

async function parsePassage(text: string): Promise<ParsedPassage> {
  try {
    const res = await fetch("/api/passages/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error("parse failed");
    return await res.json();
  } catch {
    return { book: null, chapter: null, verse_start: null, verse_end: null, reference: null, matched_text: null };
  }
}

async function transcribe(blob: Blob): Promise<string> {
  const fd = new FormData();
  fd.append(
    "file",
    new File([blob], `memo.${voiceExtension(blob)}`, { type: blob.type || "audio/webm" }),
  );
  const res = await fetch("/api/speech/transcribe", { method: "POST", body: fd });
  if (!res.ok) throw new Error("transcribe failed");
  const { text } = (await res.json()) as { text: string };
  return text;
}

export default function Composer({
  chatId,
  currentUserId,
  onOptimistic,
  onReconcile,
  replyTarget,
}: Props) {
  const [supabase] = useState(() => createClient());
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Recording finished but the realtime session may still be streaming
  // finals — the send effect below waits for it to settle.
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const parsedRef = useRef<ParsedPassage | null>(null);
  const parseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestTranscriptRef = useRef("");

  // The chat composer has no review screen: the recorder hands the blob here
  // and the memo sends itself once transcription settles.
  const recorder = useVoiceRecorder({
    onReview: (blob) => setPendingBlob(blob),
  });

  // Parse the passage on a 500ms debounce while the transcript streams, so
  // the reference is usually already known by the time the memo is sent.
  // First hit wins — later transcript growth doesn't re-parse.
  useEffect(() => {
    const t = recorder.realtimeTranscript ?? "";
    latestTranscriptRef.current = t;
    if (!t.trim() || parsedRef.current?.reference) return;
    if (parseTimerRef.current) clearTimeout(parseTimerRef.current);
    parseTimerRef.current = setTimeout(async () => {
      const current = latestTranscriptRef.current.trim();
      if (!current || parsedRef.current?.reference) return;
      const p = await parsePassage(current);
      if (p.reference) parsedRef.current = p;
    }, 500);
    return () => {
      if (parseTimerRef.current) clearTimeout(parseTimerRef.current);
    };
  }, [recorder.realtimeTranscript]);

  const startRecording = () => {
    parsedRef.current = null;
    setError(null);
    recorder.start();
  };

  const sendVoice = async (blob: Blob, realtimeText: string | null) => {
    setBusy(true);
    setError(null);
    try {
      const path = await uploadVoiceBlob(supabase, currentUserId, blob);

      let transcript: string;
      let passage: ParsedPassage | null;
      if (realtimeText && realtimeText.trim()) {
        transcript = realtimeText;
        passage = parsedRef.current?.reference
          ? parsedRef.current
          : await parsePassage(transcript);
      } else {
        // Realtime failed (null) or heard nothing — Whisper fallback.
        transcript = await transcribe(blob).catch(() => "");
        passage = transcript ? await parsePassage(transcript) : null;
      }
      transcript = applyReferenceReplacement(transcript, passage);

      await insertMessage({
        note: null,
        voice_path: path,
        transcript: transcript || null,
        passage,
      });
    } catch (err) {
      console.error(err);
      setError("Couldn't send voice memo.");
    } finally {
      setBusy(false);
    }
  };

  const sendText = async () => {
    const value = text.trim();
    if (!value) return;
    setText("");
    setBusy(true);
    setError(null);
    try {
      if (replyTarget) {
        const { error: replyErr } = await supabase
          .from("replies")
          .insert({
            message_id: replyTarget.id,
            user_id: currentUserId,
            body_text: value,
          });
        if (replyErr) throw replyErr;
      } else {
        const passage = await parsePassage(value);
        await insertMessage({
          note: applyReferenceReplacement(value, passage),
          voice_path: null,
          transcript: null,
          passage,
        });
      }
    } catch (err) {
      console.error(err);
      setError("Couldn't send.");
    } finally {
      setBusy(false);
    }
  };

  const insertMessage = async (args: {
    note: string | null;
    voice_path: string | null;
    transcript: string | null;
    passage: ParsedPassage | null;
  }) => {
    const optimisticId = `tmp-${crypto.randomUUID()}`;
    const optimistic: Message = {
      id: optimisticId,
      chat_id: chatId,
      user_id: currentUserId,
      reference: args.passage?.reference ?? null,
      book: args.passage?.book ?? null,
      chapter: args.passage?.chapter ?? null,
      verse_start: args.passage?.verse_start ?? null,
      verse_end: args.passage?.verse_end ?? null,
      note: args.note,
      voice_path: args.voice_path,
      transcript: args.transcript,
      created_at: new Date().toISOString(),
      created_tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      reactions: [],
      replies: [],
    };
    onOptimistic(optimistic);

    // onInserted reconciles the optimistic id before the share insert, so
    // the realtime message_shares handler's dedupe sees the real id.
    await insertLogWithShares(
      supabase,
      {
        userId: currentUserId,
        note: args.note,
        transcript: args.transcript,
        voicePath: args.voice_path,
        passage: args.passage,
      },
      [chatId],
      { onInserted: (id) => onReconcile(optimisticId, id) },
    );
  };

  // Send once the post-stop finals settle. Deferred a tick so the state
  // updates happen outside the effect body itself.
  useEffect(() => {
    if (!pendingBlob || recorder.liveTranscribing) return;
    const blob = pendingBlob;
    const realtimeText = recorder.realtimeTranscript;
    const id = setTimeout(() => {
      setPendingBlob(null);
      void sendVoice(blob, realtimeText);
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingBlob, recorder.liveTranscribing]);

  const replyAuthor = replyTarget?.profile?.display_name ?? "Someone";
  const replyPreview =
    replyTarget?.reference ??
    replyTarget?.transcript ??
    replyTarget?.note ??
    (replyTarget?.voice_path ? "Voice memo" : "");

  const recording = recorder.recording;
  const displayError = error ?? recorder.micError;

  return (
    <div className="px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {displayError ? (
        <p className="pb-1 text-center text-xs text-red-400">{displayError}</p>
      ) : null}
      <div className="flex items-end gap-2">
        {replyTarget ? null : (
          <button
            type="button"
            onClick={recording ? recorder.stop : startRecording}
            disabled={busy || (recording && recorder.stopping)}
            aria-label={recording ? "Stop recording" : "Record voice"}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-200 transition-transform duration-150 active:scale-95 disabled:opacity-50"
          >
            <span
              style={{ willChange: "transform, border-radius" }}
              className={`block h-5 w-5 bg-red-500 transition-[transform,border-radius] duration-300 ease-out ${
                recording ? "scale-[0.7] rounded-[4px]" : "rounded-full"
              }`}
            />
          </button>
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendText();
            }
          }}
          placeholder={
            recording ? "Recording…" : replyTarget ? `Reply to ${replyAuthor} ${replyPreview}` : "Message"
          }
          rows={1}
          disabled={recording || busy}
          className="max-h-32 min-h-[40px] flex-1 resize-none rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-2 text-[15px] text-neutral-900 outline-none focus:border-neutral-400 disabled:opacity-60"
        />

        <button
          type="button"
          onClick={sendText}
          disabled={!text.trim() || busy || recording}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white transition-transform duration-150 active:scale-95 disabled:opacity-40"
          aria-label="Send"
        >
          ↑
        </button>
      </div>
    </div>
  );
}
