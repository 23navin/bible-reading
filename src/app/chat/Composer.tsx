"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import { SpeechmaticsSession } from "@/lib/speechmatics-client";
import type { Message } from "@/lib/types";

// Assumes a public Supabase Storage bucket named "voice-memos".
const VOICE_BUCKET = "audio-memos";

type Props = {
  chatId: string;
  currentUserId: string;
  onOptimistic: (m: Message) => void;
  onReconcile: (optimisticId: string, realId: string) => void;
};

type ParsedPassage = {
  book: string | null;
  chapter: number | null;
  verse_start: number | null;
  verse_end: number | null;
  reference: string | null;
};

async function parsePassage(text: string): Promise<ParsedPassage> {
  try {
    const res = await fetch("/api/parse-passage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error("parse failed");
    return await res.json();
  } catch {
    return { book: null, chapter: null, verse_start: null, verse_end: null, reference: null };
  }
}

async function transcribe(blob: Blob): Promise<string> {
  const fd = new FormData();
  fd.append("file", new File([blob], "memo.webm", { type: blob.type || "audio/webm" }));
  const res = await fetch("/api/transcribe", { method: "POST", body: fd });
  if (!res.ok) throw new Error("transcribe failed");
  const { text } = (await res.json()) as { text: string };
  return text;
}

export default function Composer({ chatId, currentUserId, onOptimistic, onReconcile }: Props) {
  const [supabase] = useState(() => createClient());
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sessionRef = useRef<SpeechmaticsSession | null>(null);
  const finalTextRef = useRef("");
  const parsedRef = useRef<ParsedPassage | null>(null);
  const parseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeFailedRef = useRef(false);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      finalTextRef.current = "";
      parsedRef.current = null;
      realtimeFailedRef.current = false;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        await sendVoice(blob);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);

      const session = new SpeechmaticsSession({
        onFinal: (full) => {
          finalTextRef.current = full;
          if (parsedRef.current?.reference) return;
          if (parseTimerRef.current) clearTimeout(parseTimerRef.current);
          parseTimerRef.current = setTimeout(async () => {
            const t = finalTextRef.current.trim();
            if (!t || parsedRef.current?.reference) return;
            const p = await parsePassage(t);
            if (p.reference) parsedRef.current = p;
          }, 500);
        },
        onError: (err) => {
          console.error("speechmatics error", err);
          realtimeFailedRef.current = true;
        },
      });
      try {
        await session.start(stream);
        sessionRef.current = session;
      } catch (err) {
        console.error("speechmatics start failed", err);
        realtimeFailedRef.current = true;
      }
    } catch (err) {
      console.error(err);
      alert("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const sendVoice = async (blob: Blob) => {
    setBusy(true);
    try {
      const ext = blob.type.includes("mp4") ? "m4a" : "webm";
      const path = `${currentUserId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(VOICE_BUCKET)
        .upload(path, blob, { contentType: blob.type, upsert: false });
      if (upErr) throw upErr;

      const session = sessionRef.current;
      sessionRef.current = null;
      if (session && !realtimeFailedRef.current) {
        try {
          const finalText = await session.stop();
          if (finalText) finalTextRef.current = finalText;
        } catch (err) {
          console.error("speechmatics stop failed", err);
          realtimeFailedRef.current = true;
        }
      } else if (session) {
        session.abort();
      }
      if (parseTimerRef.current) {
        clearTimeout(parseTimerRef.current);
        parseTimerRef.current = null;
      }

      let transcript: string;
      let passage: ParsedPassage | null;
      if (!realtimeFailedRef.current && finalTextRef.current) {
        transcript = finalTextRef.current;
        passage = parsedRef.current ?? (await parsePassage(transcript));
      } else {
        transcript = await transcribe(blob).catch(() => "");
        passage = transcript ? await parsePassage(transcript) : null;
      }

      await insertMessage({
        note: null,
        voice_path: path,
        transcript: transcript || null,
        passage,
      });
    } catch (err) {
      console.error(err);
      alert("Couldn't send voice memo.");
    } finally {
      setBusy(false);
    }
  };

  const sendText = async () => {
    const value = text.trim();
    if (!value) return;
    setText("");
    setBusy(true);
    try {
      const passage = await parsePassage(value);
      await insertMessage({
        note: value,
        voice_path: null,
        transcript: null,
        passage,
      });
    } catch (err) {
      console.error(err);
      alert("Couldn't send.");
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
      reactions: [],
      replies: [],
    };
    onOptimistic(optimistic);

    const { data: inserted, error } = await supabase
      .from("messages")
      .insert({
        user_id: currentUserId,
        reference: args.passage?.reference ?? null,
        book: args.passage?.book ?? null,
        chapter: args.passage?.chapter ?? null,
        verse_start: args.passage?.verse_start ?? null,
        verse_end: args.passage?.verse_end ?? null,
        note: args.note,
        voice_path: args.voice_path,
        transcript: args.transcript,
      })
      .select("id")
      .single();

    if (error || !inserted) throw error ?? new Error("insert failed");

    onReconcile(optimisticId, inserted.id);

    const { error: shareErr } = await supabase
      .from("message_shares")
      .insert({ message_id: inserted.id, chat_id: chatId, shared_by: currentUserId });

    if (shareErr) throw shareErr;
  };

  return (
    <div className="border-t border-stone-200 bg-white px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          disabled={busy}
          aria-label={recording ? "Stop recording" : "Record voice"}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-200 transition-transform duration-150 active:scale-95 disabled:opacity-50"
        >
          <span
            style={{ willChange: "transform, border-radius" }}
            className={`block h-5 w-5 bg-red-500 transition-[transform,border-radius] duration-300 ease-out ${
              recording ? "scale-[0.7] rounded-[4px]" : "rounded-full"
            }`}
          />
        </button>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendText();
            }
          }}
          placeholder={recording ? "Recording…" : "Share what you read"}
          rows={1}
          disabled={recording || busy}
          className="max-h-32 min-h-[40px] flex-1 resize-none rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2 text-[15px] outline-none focus:border-stone-400 disabled:opacity-60"
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
