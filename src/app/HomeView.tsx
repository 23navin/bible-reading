"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import VoiceReview from "./VoiceReview";
import TextComposer from "./TextComposer";
import { SpeechmaticsSession } from "@/lib/speechmatics-client";
import {
  Avatar,
  AvatarStack,
  CloseIcon,
  type ChatSummary,
  type Me,
  type ParsedPassage,
} from "./home-shared";

export type { ChatSummary, Me, Member } from "./home-shared";

type Mode = "idle" | "recording" | "review" | "text";

export default function HomeView({ me, chats }: { me: Me; chats: ChatSummary[] }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [realtimeTranscript, setRealtimeTranscript] = useState<string | null>(null);
  const [realtimePassage, setRealtimePassage] = useState<ParsedPassage | null>(null);
  const [liveTranscribing, setLiveTranscribing] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [exiting, setExiting] = useState(false);
  const [recordingReady, setRecordingReady] = useState(false);
  const [stopping, setStopping] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const sessionRef = useRef<SpeechmaticsSession | null>(null);
  const finalTextRef = useRef("");
  const parsedRef = useRef<ParsedPassage | null>(null);
  const parseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parseAbortRef = useRef<AbortController | null>(null);
  const realtimeFailedRef = useRef(false);

  const openVoice = () => {
    setMicError(null);
    finalTextRef.current = "";
    parsedRef.current = null;
    realtimeFailedRef.current = false;
    // Empty string (vs. null) signals to VoiceReview that realtime is the
    // source of truth; we'll fall back to null only if the session fails
    // before stop.
    setRealtimeTranscript("");
    setRealtimePassage(null);
    setLiveTranscribing(false);
    setRecordingReady(false);
    setStopping(false);
    setMode("recording");
  };
  const openText = () => setMode("text");
  const closeOverlay = () => {
    if (mode === "review" || mode === "text") {
      setExiting(true);
      setTimeout(() => {
        setMode("idle");
        setBlob(null);
        setRealtimeTranscript(null);
        setRealtimePassage(null);
        setLiveTranscribing(false);
        setExiting(false);
      }, 200);
    } else {
      setMode("idle");
      setBlob(null);
      setRealtimeTranscript(null);
      setRealtimePassage(null);
      setLiveTranscribing(false);
    }
  };

  useEffect(() => {
    if (mode !== "recording") return;

    let aborted = false;
    let activeRec: MediaRecorder | null = null;

    // Mint the Speechmatics token in parallel with the start animation and
    // mic-permission prompt so it's ready when SpeechmaticsSession needs it.
    const tokenPromise: Promise<string | undefined> = fetch(
      "/api/speechmatics-token",
      { method: "POST" },
    )
      .then((r) => (r.ok ? (r.json() as Promise<{ token: string }>) : null))
      .then((d) => d?.token)
      .catch(() => undefined);

    const runParse = async () => {
      // Skip if we already have a fully-specified reference (book + chapter
      // + verse range). Partial hits (book-only, chapter-only) must remain
      // re-parsable as the transcript grows.
      if (passageSpecificity(parsedRef.current) >= 4) return;
      const text = finalTextRef.current.trim();
      if (!text) return;
      parseAbortRef.current?.abort();
      const ac = new AbortController();
      parseAbortRef.current = ac;
      try {
        const res = await fetch("/api/parse-passage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: ac.signal,
        });
        if (!res.ok) return;
        const p = (await res.json()) as ParsedPassage;
        if (parseAbortRef.current !== ac) return;
        if (!p.reference) return;
        // Guard against a re-parse that returns less detail than what we
        // already have — Haiku occasionally regresses on longer transcripts.
        if (passageSpecificity(p) < passageSpecificity(parsedRef.current)) return;
        parsedRef.current = p;
        setRealtimePassage(p);
      } catch {
        // Aborted or network error — leave for a later attempt or fallback.
      }
    };

    const scheduleParse = () => {
      if (parsedRef.current?.reference) return;
      if (parseTimerRef.current) clearTimeout(parseTimerRef.current);
      parseTimerRef.current = setTimeout(() => {
        void runParse();
      }, 500);
    };

    const finalizeAndOpenReview = async (recordedBlob: Blob) => {
      // Null the session ref before any setMode so the mode-change cleanup
      // below doesn't abort the live session out from under us.
      const session = sessionRef.current;
      sessionRef.current = null;

      if (realtimeFailedRef.current) {
        // Realtime never came up. Fall back to Whisper: hand the blob to
        // VoiceReview, which will transcribe it itself.
        session?.abort();
        setRealtimeTranscript(null);
        setRealtimePassage(null);
        setBlob(recordedBlob);
        setMode("review");
        return;
      }

      // Realtime is alive. Move to review immediately so the user sees the
      // streaming transcript fill in, and finish stop+parse in the background.
      setBlob(recordedBlob);
      setLiveTranscribing(true);
      setMode("review");

      if (session) {
        try {
          const finalText = await session.stop();
          if (finalText) finalTextRef.current = finalText;
          setRealtimeTranscript(finalTextRef.current);
        } catch (err) {
          console.warn("speechmatics stop failed", err);
        }
      }

      // Speechmatics emits trailing finals while session.stop() awaits
      // EndOfTranscript. Each one schedules a debounced parse — if any of
      // those timers fire after this point they'll abort the explicit
      // runParse below and leave parsedRef null. Drain them now.
      if (parseTimerRef.current) {
        clearTimeout(parseTimerRef.current);
        parseTimerRef.current = null;
      }
      parseAbortRef.current?.abort();
      parseAbortRef.current = null;

      if (finalTextRef.current) {
        await runParse();
      }
      setRealtimePassage(parsedRef.current);
      setLiveTranscribing(false);
    };

    // Bring up the Speechmatics audio path BEFORE starting MediaRecorder.
    // On iOS, attaching an AudioContext to a getUserMedia stream briefly
    // reconfigures the audio session for voice processing — that reroute
    // drops a few ms of samples. If MediaRecorder is already recording when
    // it happens, those dropped samples show up as a stitched/skipped
    // syllable at the start of the clip. Doing prepareAudio first keeps
    // the disruption out of the recording entirely.
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (aborted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const rec = new MediaRecorder(stream);
        activeRec = rec;
        chunksRef.current = [];
        finalTextRef.current = "";
        parsedRef.current = null;
        realtimeFailedRef.current = false;
        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          if (aborted) return;
          const b = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
          void finalizeAndOpenReview(b);
        };

        const session = new SpeechmaticsSession({
          onPartial: (full) => {
            // Partials only fire during recording (Speechmatics stops sending
            // them after StopRecognition). Pushing them into state lets a
            // post-stop view show the trailing partial without a stutter
            // while the final segments catch up.
            setRealtimeTranscript(full);
          },
          onFinal: (full) => {
            finalTextRef.current = full;
            setRealtimeTranscript(full);
            scheduleParse();
          },
          onError: (err) => {
            console.warn("speechmatics error", err);
            realtimeFailedRef.current = true;
          },
        });
        // Track immediately so a stop/cancel mid-handshake can abort it.
        sessionRef.current = session;

        try {
          await session.prepareAudio(stream);
        } catch (err) {
          console.warn("speechmatics prepareAudio failed", err);
          realtimeFailedRef.current = true;
          session.abort();
          if (sessionRef.current === session) sessionRef.current = null;
        }
        if (aborted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        rec.start();
        startedAtRef.current = Date.now();
        setElapsedMs(0);
        recorderRef.current = rec;
        setRecordingReady(true);

        if (!realtimeFailedRef.current) {
          void (async () => {
            try {
              const token = await tokenPromise;
              await session.connectClient(token ? { token } : undefined);
              if (aborted) {
                session.abort();
                if (sessionRef.current === session) sessionRef.current = null;
              }
            } catch (err) {
              console.warn("speechmatics connectClient failed", err);
              realtimeFailedRef.current = true;
              session.abort();
              if (sessionRef.current === session) sessionRef.current = null;
            }
          })();
        }
      } catch {
        if (!aborted) {
          setMicError("Microphone access denied.");
          setMode("idle");
        }
      }
    })();

    return () => {
      aborted = true;
      if (recorderRef.current === activeRec) recorderRef.current = null;
      if (activeRec && activeRec.state !== "inactive") activeRec.stop();
      if (sessionRef.current) {
        sessionRef.current.abort();
        sessionRef.current = null;
      }
      if (parseTimerRef.current) {
        clearTimeout(parseTimerRef.current);
        parseTimerRef.current = null;
      }
      parseAbortRef.current?.abort();
      parseAbortRef.current = null;
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "recording") return;
    const id = setInterval(() => {
      if (startedAtRef.current != null) {
        setElapsedMs(Date.now() - startedAtRef.current);
      }
    }, 250);
    return () => clearInterval(id);
  }, [mode]);

  function stopRecording() {
    if (!recordingReady) {
      // User tapped the (already-morphed) button before the session finished
      // connecting. Treat it as a cancel rather than a silent no-op.
      setMode("idle");
      return;
    }
    if (stopping) return;
    setStopping(true);
    recorderRef.current?.stop();
    recorderRef.current = null;
  }

  const displayName = me.display_name ?? me.username ?? "friend";
  const recording = mode === "recording";
  const overlayActive = mode === "review" || mode === "text" || exiting;

  return (
    <main className="flex h-full min-h-0 flex-col bg-zinc-900 text-zinc-100">
      <header className="relative flex shrink-0 items-center justify-between px-8 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        {recording ? (
          <>
            <span className="h-10 w-10" aria-hidden />
            <button
              type="button"
              onClick={closeOverlay}
              aria-label="Cancel recording"
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-2 active:bg-zinc-800"
            >
              <CloseIcon className="h-6 w-6 text-zinc-300" />
            </button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">
              <span className="text-white">{displayName}</span>&apos;s Reading Log
            </h1>
            <Link
              href="/archive"
              aria-label="Open your archive"
              style={{ borderRadius: 8 }}
              className="ring-1 ring-zinc-700 active:ring-zinc-500"
            >
              <Avatar name={displayName} id={me.id} size={40} />
            </Link>
          </>
        )}
      </header>

      <section className="min-h-0 flex-1 overflow-y-auto px-8">
        {recording ? (
          <div className="screen-fade-in flex h-full items-center justify-center">
            <p className="text-center italic text-md text-zinc-600">
              {stopping
                ? "finishing up…"
                : recordingReady
                  ? "start by saying the passage"
                  : "connecting…"}
            </p>
          </div>
        ) : (
          <ul
            className={`flex flex-col gap-1 py-4 ${
              overlayActive ? "" : "screen-fade-in"
            }`}
          >
            {chats.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/chat/${c.id}`}
                  className="relative flex items-center gap-3 rounded-md py-2 active:bg-zinc-800"
                >
                  <UnreadDot
                    active={c.hasUnread}
                    className="absolute -left-4 top-1/2 -translate-y-1/2"
                  />
                  <span className="text-lg text-zinc-100">{c.name}</span>
                  <AvatarStack members={c.members} />
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/chats/new"
                className="flex items-center rounded-md py-2 text-zinc-400 active:bg-zinc-800"
              >
                <span className="text-lg">new chat</span>
              </Link>
            </li>
          </ul>
        )}
      </section>

      {mode === "idle" || recording || exiting ? (
        <div className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          <p
            aria-hidden={!recording}
            className="mb-2 text-center text-sm tabular-nums text-zinc-400"
          >
            {recording && recordingReady ? formatElapsed(elapsedMs) : " "}
          </p>
          <div className="flex">
            <button
              type="button"
              onClick={recording ? stopRecording : openVoice}
              disabled={recording && stopping}
              aria-label={recording ? "Stop recording" : "Record voice log"}
              className="flex h-20 min-w-0 flex-1 items-center justify-center rounded-md border border-red-500 bg-transparent active:bg-red-500/10 disabled:opacity-60"
            >
              <span
                aria-hidden
                style={{ willChange: "border-radius" }}
                className={`block h-8 w-8 bg-red-500 transition-[border-radius] duration-300 ease-out ${
                  recording ? "rounded-sm" : "rounded-full"
                }`}
              />
            </button>
            <button
              type="button"
              onClick={openText}
              disabled={recording}
              tabIndex={recording ? -1 : 0}
              aria-label="Type a log"
              aria-hidden={recording}
              style={{ willChange: "width, margin, opacity" }}
              className={`flex h-20 items-center justify-center overflow-hidden rounded-md border border-dashed bg-transparent text-zinc-300 transition-[width,margin,opacity,border-color] duration-300 ease-out ${
                recording ? "ml-0 w-0 border-transparent opacity-0" : "ml-3 w-20 border-zinc-400 opacity-100"
              }`}
            >
              <KeyboardIcon className="h-7 w-7 shrink-0" />
            </button>
          </div>
          {micError ? (
            <p className="pt-3 text-center text-sm text-red-400">{micError}</p>
          ) : null}
        </div>
      ) : null}

      {mode === "review" && blob ? (
        <VoiceReview
          me={me}
          chats={chats}
          blob={blob}
          initialTranscript={realtimeTranscript}
          initialPassage={realtimePassage}
          liveTranscribing={liveTranscribing}
          onClose={closeOverlay}
          exiting={exiting}
        />
      ) : null}
      {mode === "text" ? (
        <TextComposer me={me} chats={chats} onClose={closeOverlay} exiting={exiting} />
      ) : null}
    </main>
  );
}

function UnreadDot({ active, className = "" }: { active: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={`h-2 w-2 shrink-0 rounded-full ${
        active ? "bg-blue-500" : "bg-transparent"
      } ${className}`}
    />
  );
}

function KeyboardIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="2" y="6" width="20" height="13" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14.5h10" />
    </svg>
  );
}

function passageSpecificity(p: ParsedPassage | null): number {
  if (!p?.reference) return 0;
  if (p.verse_end != null) return 4;
  if (p.verse_start != null) return 3;
  if (p.chapter != null) return 2;
  if (p.book != null) return 1;
  return 0;
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
