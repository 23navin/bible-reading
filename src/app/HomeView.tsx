"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import VoiceReview from "./VoiceReview";
import TextComposer from "./TextComposer";
import { CloseIcon, type ChatSummary, type Me, type Member } from "./home-shared";

export type { ChatSummary, Me, Member } from "./home-shared";

type Mode = "idle" | "recording" | "review" | "text";

export default function HomeView({ me, chats }: { me: Me; chats: ChatSummary[] }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);

  const openVoice = () => {
    setMicError(null);
    setMode("recording");
  };
  const openText = () => setMode("text");
  const closeOverlay = () => {
    setMode("idle");
    setBlob(null);
  };

  useEffect(() => {
    if (mode !== "recording") return;

    let aborted = false;
    let activeRec: MediaRecorder | null = null;

    // Let the morph + keyboard-collapse transition (300ms) finish before
    // touching getUserMedia / MediaRecorder. On iOS these block the main
    // thread enough to drop frames mid-animation.
    const initTimer = setTimeout(() => {
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
          rec.ondataavailable = (e) => {
            if (e.data.size > 0) chunksRef.current.push(e.data);
          };
          rec.onstop = () => {
            stream.getTracks().forEach((t) => t.stop());
            if (aborted) return;
            const b = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
            setBlob(b);
            setMode("review");
          };
          rec.start();
          startedAtRef.current = Date.now();
          setElapsedMs(0);
          recorderRef.current = rec;
        } catch {
          if (!aborted) {
            setMicError("Microphone access denied.");
            setMode("idle");
          }
        }
      })();
    }, 320);

    return () => {
      aborted = true;
      clearTimeout(initTimer);
      if (recorderRef.current === activeRec) recorderRef.current = null;
      if (activeRec && activeRec.state !== "inactive") activeRec.stop();
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
    recorderRef.current?.stop();
    recorderRef.current = null;
  }

  const displayName = me.display_name ?? me.username ?? "friend";
  const recording = mode === "recording";

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
          <div className="flex h-full items-center justify-center">
            <p className="text-center italic text-md text-zinc-600">
              start by saying the passage
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1 py-4">
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

      {mode === "idle" || recording ? (
        <div className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          <p
            aria-hidden={!recording}
            className="mb-2 text-center text-sm tabular-nums text-zinc-400"
          >
            {recording ? formatElapsed(elapsedMs) : " "}
          </p>
          <div className="flex">
            <button
              type="button"
              onClick={recording ? stopRecording : openVoice}
              aria-label={recording ? "Stop recording" : "Record voice log"}
              className="flex h-20 min-w-0 flex-1 items-center justify-center rounded-md border border-red-500 bg-transparent active:bg-red-500/10"
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
        <VoiceReview me={me} chats={chats} blob={blob} onClose={closeOverlay} />
      ) : null}
      {mode === "text" ? (
        <TextComposer me={me} chats={chats} onClose={closeOverlay} />
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
            borderRadius: 8,
          }}
          className="ring-2 ring-zinc-900"
        >
          <Avatar name={m.display_name ?? "?"} id={m.id} size={28} />
        </div>
      ))}
      {overflow > 0 ? (
        <div
          style={{ marginLeft: -10, zIndex: 0, borderRadius: 8 }}
          className="flex h-7 w-7 items-center justify-center bg-zinc-700 text-[10px] font-semibold text-zinc-200 ring-2 ring-zinc-900"
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
      style={{ width: size, height: size, backgroundColor: bg, fontSize: size * 0.42, borderRadius: 8 }}
      className="flex items-center justify-center font-semibold text-white select-none"
    >
      {initial}
    </div>
  );
}

const AVATAR_PALETTE = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
  "#6366f1",
  "#a855f7",
  "#ec4899",
];
function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
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

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
