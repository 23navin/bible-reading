"use client";

import Link from "next/link";
import { useState } from "react";
import VoiceReview from "./voice-review";
import TextComposer from "./text-composer";
import { createChat } from "@/app/_actions/create-chat";
import { useVoiceRecorder } from "@/lib/audio/use-voice-recorder";
import { Shell, Header, Body, Footer } from "@/components/shell";
import { Avatar, AvatarStack } from "@/components/avatar";
import { CloseIcon, KeyboardIcon } from "@/components/icons";
import { formatChatTimestamp, formatElapsed, formatPlanDate } from "@/lib/format";
import { useHydrated } from "@/components/local-time";
import type { ChatSummary, Me } from "@/lib/types";
import type { NextReading } from "@/lib/reading-plan";

type Mode = "idle" | "review" | "text";

export default function HomeView({
  me,
  chats,
  nextReading,
  error,
}: {
  me: Me;
  chats: ChatSummary[];
  nextReading: NextReading | null;
  error?: string | null;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [exiting, setExiting] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);
  // Chat timestamps depend on the viewer's timezone, so they can only be
  // rendered after hydration.
  const hydrated = useHydrated();

  const recorder = useVoiceRecorder({
    onReview: (recordedBlob) => {
      setBlob(recordedBlob);
      setMode("review");
    },
  });

  const openVoice = () => {
    setCreatingChat(false);
    recorder.start();
  };
  const openText = () => {
    setCreatingChat(false);
    setMode("text");
  };
  const closeOverlay = () => {
    setExiting(true);
    setTimeout(() => {
      setMode("idle");
      setBlob(null);
      setExiting(false);
    }, 200);
  };

  const displayName = me.display_name ?? me.username ?? "Unknown";
  const recording = recorder.recording;
  const overlayActive = mode === "review" || mode === "text" || exiting;

  return (
    <Shell className="bg-neutral-900 text-neutral-100">
      <Header className="relative flex items-center justify-between px-8 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        {recording ? (
          <>
            <span className="h-10 w-10" aria-hidden />
            <button
              type="button"
              onClick={recorder.cancel}
              aria-label="Cancel recording"
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-2 active:bg-neutral-800"
            >
              <CloseIcon className="h-6 w-6 text-neutral-300" />
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
              className="ring-1 ring-neutral-700 active:ring-neutral-500"
            >
              <Avatar name={displayName} id={me.id} size={40} />
            </Link>
          </>
        )}
      </Header>

      <Body className="px-8">
        {recording ? (
          <div className="screen-fade-in flex h-full items-center justify-center">
            <p className="text-center italic text-md text-neutral-600">
              {recorder.stopping
                ? "finishing up…"
                : recorder.recordingReady
                  ? "start by saying the passage"
                  : "connecting…"}
            </p>
          </div>
        ) : (
          <>
          {error ? <p className="pt-4 text-sm text-red-400">{error}</p> : null}
          <ul
            className={`flex flex-col gap-1 py-4 ${
              overlayActive ? "" : "screen-fade-in"
            }`}
          >
            {chats.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/chat/${c.id}`}
                  className="relative flex items-center gap-3 rounded-md py-2 active:bg-neutral-800"
                >
                  <UnreadDot
                    active={c.hasUnread}
                    className="absolute -left-4 top-1/2 -translate-y-1/2"
                  />
                  <span className="text-lg text-neutral-100">{c.name}</span>
                  <AvatarStack members={c.members} />
                  {c.lastMessageAt ? (
                    <span className="ml-auto shrink-0 text-sm tabular-nums text-neutral-500">
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
                    className="min-w-0 flex-1 border-0 bg-transparent p-0 text-lg text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-0"
                  />
                  <button
                    type="submit"
                    onMouseDown={(e) => e.preventDefault()}
                    className="shrink-0 text-lg text-neutral-100 active:text-neutral-500"
                  >
                    create
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreatingChat(true)}
                  className="flex w-full items-center rounded-md py-2 text-left text-neutral-400 active:bg-neutral-800"
                >
                  <span className="text-lg">new chat</span>
                </button>
              )}
            </li>
          </ul>
          </>
        )}
      </Body>

      {mode === "idle" || recording || exiting ? (
        <Footer className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          <div className="mb-2 flex min-h-5 justify-center text-sm text-neutral-400">
            {recording ? (
              <p aria-hidden={!recorder.recordingReady} className="text-center tabular-nums">
                {recorder.recordingReady ? formatElapsed(recorder.elapsedMs) : " "}
              </p>
            ) : hydrated ? (
              <NextReadingPrompt reading={nextReading} />
            ) : null}
          </div>
          <div className="flex">
            <button
              type="button"
              onClick={recording ? recorder.stop : openVoice}
              disabled={recording && recorder.stopping}
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
              className={`flex h-20 items-center justify-center overflow-hidden rounded-md border border-dashed bg-transparent text-neutral-300 transition-[width,margin,opacity,border-color] duration-300 ease-out ${
                recording ? "ml-0 w-0 border-transparent opacity-0" : "ml-3 w-20 border-neutral-400 opacity-100"
              }`}
            >
              <KeyboardIcon className="h-7 w-7 shrink-0" />
            </button>
          </div>
          {recorder.micError ? (
            <p className="pt-3 text-center text-sm text-red-400">{recorder.micError}</p>
          ) : null}
        </Footer>
      ) : null}

      {mode === "review" && blob ? (
        <VoiceReview
          me={me}
          chats={chats}
          blob={blob}
          initialTranscript={recorder.realtimeTranscript}
          liveTranscribing={recorder.liveTranscribing}
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
// row, with the date linking to that day on the plan page and the reference
// deep-linking into the bible app. Rendered post-hydration only: the date
// label depends on the viewer's timezone.
function NextReadingPrompt({ reading }: { reading: NextReading | null }) {
  if (!reading) return null;

  return (
    <p className="text-left">
      <Link
        href={`/plan#day-${reading.date}`}
        className="active:text-neutral-200"
      >
        {formatPlanDate(reading.date)}
      </Link>{" "}
      {reading.href ? (
        <a
          href={reading.href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-neutral-100 decoration-neutral-500 underline-offset-4 active:text-neutral-400"
        >
          {reading.passage}
        </a>
      ) : (
        <span className="font-semibold text-neutral-100">{reading.passage}</span>
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

