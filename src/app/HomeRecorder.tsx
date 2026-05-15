"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import { signOut } from "./auth/actions";

const VOICE_BUCKET = "audio-memos";

export type ChatOption = { id: string; name: string };

type Props = { userId: string; chats: ChatOption[] };

type ParsedPassage = {
  book: string | null;
  chapter: number | null;
  verse_start: number | null;
  verse_end: number | null;
  reference: string | null;
};

type Stage = "idle" | "recording" | "review";

export default function HomeRecorder({ userId, chats }: Props) {
  const [supabase] = useState(() => createClient());
  const [stage, setStage] = useState<Stage>("idle");
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

  const reset = () => {
    setStage("idle");
    setBlob(null);
    setTranscript("");
    setReference(null);
    setPassage(null);
    setSelectedChatIds(new Set());
    setError(null);
  };

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const b = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        setBlob(b);
        setStage("review");
        void runTranscribe(b);
      };
      rec.start();
      recorderRef.current = rec;
      setStage("recording");
    } catch {
      setError("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
  };

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

  const toggleChat = (id: string) => {
    setSelectedChatIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const send = async () => {
    if (!blob) return;
    setSending(true);
    setError(null);
    try {
      const ext = blob.type.includes("mp4") ? "m4a" : "webm";
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(VOICE_BUCKET)
        .upload(path, blob, { contentType: blob.type });
      if (upErr) throw upErr;

      const { data: inserted, error: insErr } = await supabase
        .from("messages")
        .insert({
          user_id: userId,
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
          shared_by: userId,
        }));
        const { error: shareErr } = await supabase.from("message_shares").insert(shareRows);
        if (shareErr) throw shareErr;
      }

      reset();
    } catch (err) {
      console.error("send failed", err);
      const msg =
        err instanceof Error
          ? err.message
          : err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string"
            ? (err as { message: string }).message
            : null;
      setError(msg || "Couldn't send.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center justify-between px-5 pt-6 pb-3">
        <h1 className="text-xl font-bold tracking-tight">ScriptureShare</h1>
        <form action={signOut}>
          <button className="text-sm text-stone-500 active:text-stone-700">Sign out</button>
        </form>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center px-6">
        {stage === "idle" ? (
          <>
            <button
              onClick={startRecording}
              className="flex h-32 w-32 items-center justify-center rounded-full bg-red-500 text-5xl text-white shadow-lg active:scale-95"
              aria-label="Record voice memo"
            >
              🎤
            </button>
            <p className="mt-6 text-center text-sm text-stone-500">
              Tap to record what you read today.
            </p>
          </>
        ) : null}

        {stage === "recording" ? (
          <>
            <button
              onClick={stopRecording}
              className="flex h-32 w-32 items-center justify-center rounded-full bg-red-500 text-4xl text-white shadow-lg active:scale-95"
              aria-label="Stop recording"
            >
              ■
            </button>
            <p className="mt-6 animate-pulse text-center text-sm text-red-600">
              Recording… tap to stop
            </p>
          </>
        ) : null}

        {stage === "review" && blob ? (
          <div className="w-full max-w-md space-y-4">
            <audio
              controls
              src={URL.createObjectURL(blob)}
              className="h-10 w-full"
            />

            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              {reference ? (
                <div className="mb-2 inline-flex rounded-full bg-stone-100 px-3 py-1 text-sm font-semibold">
                  {reference}
                </div>
              ) : null}
              {transcribing ? (
                <p className="text-sm text-stone-400">Transcribing…</p>
              ) : (
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="Transcript will appear here"
                  rows={4}
                  className="w-full resize-none rounded-xl bg-transparent text-[15px] outline-none"
                />
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">
                Also share to
              </p>
              {chats.length === 0 ? (
                <p className="text-sm text-stone-400">
                  No chats yet — this will save to your archive only.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {chats.map((c) => {
                    const on = selectedChatIds.has(c.id);
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggleChat(c.id)}
                        className={`rounded-full border px-3 py-1.5 text-sm ${
                          on
                            ? "border-blue-500 bg-blue-500 text-white"
                            : "border-stone-200 bg-white text-stone-700"
                        }`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="mt-2 text-xs text-stone-400">
                {selectedChatIds.size === 0
                  ? "Saves to your archive only."
                  : `Saves to archive + ${selectedChatIds.size} chat${selectedChatIds.size === 1 ? "" : "s"}.`}
              </p>
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <div className="flex gap-2">
              <button
                onClick={reset}
                disabled={sending}
                className="flex-1 rounded-xl border border-stone-200 bg-white px-4 py-3 font-medium text-stone-700 active:bg-stone-50 disabled:opacity-50"
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

        {error && stage !== "review" ? (
          <p className="mt-4 text-sm text-red-600">{error}</p>
        ) : null}
      </section>

      {stage === "idle" ? (
        <nav className="grid grid-cols-2 gap-3 px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Link
            href="/archive"
            className="rounded-2xl bg-white p-4 shadow-sm active:bg-stone-50"
          >
            <div className="text-lg">📖</div>
            <div className="mt-1 font-semibold">Archive</div>
            <div className="text-xs text-stone-500">Your readings</div>
          </Link>
          <Link
            href="/chats"
            className="rounded-2xl bg-white p-4 shadow-sm active:bg-stone-50"
          >
            <div className="text-lg">💬</div>
            <div className="mt-1 font-semibold">Chats</div>
            <div className="text-xs text-stone-500">Groups &amp; DMs</div>
          </Link>
        </nav>
      ) : null}
    </main>
  );
}
