"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import VoiceReview from "./voice-review";
import TextComposer from "./text-composer";
import { createChat } from "@/app/_actions/create-chat";
import { SpeechmaticsSession } from "@/lib/speech/speechmatics";
import { Shell, Header, Body, Footer } from "@/components/shell";
import { Avatar, AvatarStack } from "@/components/avatar";
import { CloseIcon } from "@/components/icons";
import { formatChatTimestamp, formatElapsed, formatPlanDate } from "@/lib/format";
import { useHydrated } from "@/components/local-time";
import type { ChatSummary, Me } from "@/lib/types";
import type { NextReading } from "@/lib/reading-plan";

type Mode = "idle" | "recording" | "review" | "text";

export default function HomeView({
  me,
  chats,
  nextReading,
}: {
  me: Me;
  chats: ChatSummary[];
  nextReading: NextReading | null;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [realtimeTranscript, setRealtimeTranscript] = useState<string | null>(null);
  const [liveTranscribing, setLiveTranscribing] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [exiting, setExiting] = useState(false);
  const [recordingReady, setRecordingReady] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);
  // Chat timestamps depend on the viewer's timezone, so they can only be
  // rendered after hydration.
  const hydrated = useHydrated();

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const sessionRef = useRef<SpeechmaticsSession | null>(null);
  const finalTextRef = useRef("");
  const realtimeFailedRef = useRef(false);

  const openVoice = () => {
    setMicError(null);
    finalTextRef.current = "";
    realtimeFailedRef.current = false;
    // Empty string (vs. null) signals to VoiceReview that realtime is the
    // source of truth; we'll fall back to null only if the session fails
    // before stop.
    setRealtimeTranscript("");
    setLiveTranscribing(false);
    setRecordingReady(false);
    setStopping(false);
    setCreatingChat(false);
    setMode("recording");
  };
  const openText = () => {
    setCreatingChat(false);
    setMode("text");
  };
  const closeOverlay = () => {
    if (mode === "review" || mode === "text") {
      setExiting(true);
      setTimeout(() => {
        setMode("idle");
        setBlob(null);
        setRealtimeTranscript(null);
        setLiveTranscribing(false);
        setExiting(false);
      }, 200);
    } else {
      setMode("idle");
      setBlob(null);
      setRealtimeTranscript(null);
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
      "/api/speech/token",
      { method: "POST" },
    )
      .then((r) => (r.ok ? (r.json() as Promise<{ token: string }>) : null))
      .then((d) => d?.token)
      .catch(() => undefined);

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
        setBlob(recordedBlob);
        setMode("review");
        return;
      }

      // Realtime is alive. Move to review immediately so the user sees the
      // streaming transcript fill in, and finish the stop in the background.
      // Cleanup + passage parsing happen in VoiceReview once the transcript
      // settles.
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

  const displayName = me.display_name ?? me.username ?? "Unknown";
  const recording = mode === "recording";
  const overlayActive = mode === "review" || mode === "text" || exiting;

  return (
    <Shell className="bg-zinc-900 text-zinc-100">
      <Header className="relative flex items-center justify-between px-8 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
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
              <span className="text-white">{displayName}</span>&apos;s reading log
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
      </Header>

      <Body className="px-8">
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
                  {c.lastMessageAt ? (
                    <span className="ml-auto shrink-0 text-sm tabular-nums text-zinc-500">
                      {hydrated ? formatChatTimestamp(c.lastMessageAt) : null}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
            <li>
              {creatingChat ? (
                <form action={createChat} className="flex items-center gap-3 py-2">
                  <input
                    name="name"
                    type="text"
                    required
                    autoFocus
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="go"
                    placeholder="type a name for this chat"
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setCreatingChat(false);
                      }
                    }}
                    onBlur={(e) => {
                      const next = e.relatedTarget as HTMLElement | null;
                      if (next && e.currentTarget.form?.contains(next)) return;
                      if (!e.currentTarget.value.trim()) setCreatingChat(false);
                    }}
                    className="min-w-0 flex-1 border-0 bg-transparent p-0 text-lg text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-0"
                  />
                  <button
                    type="submit"
                    onMouseDown={(e) => e.preventDefault()}
                    className="shrink-0 text-lg text-zinc-100 active:text-zinc-500"
                  >
                    create
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreatingChat(true)}
                  className="flex w-full items-center rounded-md py-2 text-left text-zinc-400 active:bg-zinc-800"
                >
                  <span className="text-lg">new chat</span>
                </button>
              )}
            </li>
          </ul>
        )}
      </Body>

      {mode === "idle" || recording || exiting ? (
        <Footer className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          <div className="mb-2 flex min-h-5 justify-center text-sm text-zinc-400">
            {recording ? (
              <p aria-hidden={!recordingReady} className="text-center tabular-nums">
                {recordingReady ? formatElapsed(elapsedMs) : " "}
              </p>
            ) : hydrated ? (
              <NextReadingPrompt reading={nextReading} />
            ) : null}
          </div>
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
        </Footer>
      ) : null}

      {mode === "review" && blob ? (
        <VoiceReview
          me={me}
          chats={chats}
          blob={blob}
          initialTranscript={realtimeTranscript}
          liveTranscribing={liveTranscribing}
          onClose={closeOverlay}
          exiting={exiting}
        />
      ) : null}
      {mode === "text" ? (
        <TextComposer me={me} chats={chats} onClose={closeOverlay} exiting={exiting} />
      ) : null}
    </Shell>
  );
}

// "Next reading: Jun 1 Micah 5" — the earliest plan day without a progress
// row, with the reference deep-linking into the bible app. Rendered
// post-hydration only: the date label depends on the viewer's timezone.
function NextReadingPrompt({ reading }: { reading: NextReading | null }) {
  if (!reading) return null;

  return (
    <p className="text-left">
      Next reading: {formatPlanDate(reading.date)}{" "}
      {reading.href ? (
        <a
          href={reading.href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-zinc-100 underline decoration-zinc-500 underline-offset-4 active:text-zinc-400"
        >
          {reading.passage}
        </a>
      ) : (
        <span className="font-semibold text-zinc-100">{reading.passage}</span>
      )}
    </p>
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

