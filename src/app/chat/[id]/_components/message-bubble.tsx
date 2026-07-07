"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/db/client";
import type { Message } from "@/lib/types";
import LocalTime from "@/components/local-time";
import { bibleComUrlForReference } from "@/lib/reading-plan";

type Props = {
  message: Message;
  isMine: boolean;
  currentUserId: string;
  isReplyTarget: boolean;
  onToggleReplyTarget: (id: string) => void;
  translation: string | null;
};

const SWIPE_THRESHOLD = 50;
const SWIPE_MAX = 80;

export default function MessageBubble({
  message,
  isMine,
  currentUserId,
  isReplyTarget,
  onToggleReplyTarget,
  translation,
}: Props) {
  const supabase = createClient();
  const [isPlaying, setIsPlaying] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const swipeFiredRef = useRef(false);
  const doubleTapFiredRef = useRef(false);
  const lastTapAtRef = useRef(0);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const gestureRef = useRef<"pending" | "swipe" | "scroll" | null>(null);
  const DOUBLE_TAP_MS = 300;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [message.voice_signed_url]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch((err) => {
        console.error("audio play failed", err);
      });
    } else {
      audio.pause();
    }
  };

  const heart = (message.reactions ?? []).find(
    (r) => r.user_id === currentUserId && r.emoji === "❤️",
  );
  const heartCount = (message.reactions ?? []).filter((r) => r.emoji === "❤️").length;
  const replies = message.replies ?? [];
  const replyCount = replies.length;

  const toggleHeart = async () => {
    if (heart) {
      await supabase
        .from("reactions")
        .delete()
        .eq("message_id", message.id)
        .eq("user_id", currentUserId)
        .eq("emoji", "❤️");
    } else {
      await supabase
        .from("reactions")
        .insert({ message_id: message.id, user_id: currentUserId, emoji: "❤️" });
    }
  };

  const resetGesture = () => {
    pointerStartRef.current = null;
    gestureRef.current = null;
    setIsSwiping(false);
    setSwipeOffset(0);
  };

  const onBubblePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    swipeFiredRef.current = false;
    doubleTapFiredRef.current = false;
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    gestureRef.current = "pending";
  };

  const onBubblePointerMove = (e: React.PointerEvent) => {
    const start = pointerStartRef.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;

    if (gestureRef.current === "pending") {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
        gestureRef.current = "scroll";
      } else if (dx > 8 && Math.abs(dx) > Math.abs(dy)) {
        gestureRef.current = "swipe";
        setIsSwiping(true);
      }
    }

    if (gestureRef.current === "swipe") {
      const clamped = Math.max(0, Math.min(dx, SWIPE_MAX));
      setSwipeOffset(clamped);
    }
  };

  const onBubblePointerUp = () => {
    if (gestureRef.current === "swipe") {
      if (swipeOffset >= SWIPE_THRESHOLD) {
        swipeFiredRef.current = true;
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(10);
        }
        onToggleReplyTarget(message.id);
      }
    } else if (gestureRef.current === "pending") {
      const now = Date.now();
      if (now - lastTapAtRef.current < DOUBLE_TAP_MS) {
        doubleTapFiredRef.current = true;
        lastTapAtRef.current = 0;
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(15);
        }
        toggleHeart();
      } else {
        lastTapAtRef.current = now;
      }
    }
    resetGesture();
  };

  const onBubbleClickCapture = (e: React.MouseEvent) => {
    if (swipeFiredRef.current || doubleTapFiredRef.current) {
      e.stopPropagation();
      e.preventDefault();
      swipeFiredRef.current = false;
      doubleTapFiredRef.current = false;
    }
  };

  const reference = message.reference;
  const referenceHref = reference ? bibleComUrlForReference(reference, translation) : null;
  const body = message.transcript ?? message.note;
  const hasAudio = Boolean(message.voice_signed_url);
  const authorName = message.profile?.display_name ?? "Someone";

  return (
    <div className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
      <div className={`mb-0.5 flex items-baseline gap-1 px-4 text-sm ${isMine ? "flex-row-reverse" : ""}`}>
        {!isMine ? <span className="text-neutral-200">{authorName}</span> : null}
        <LocalTime
          iso={message.created_at}
          timeZone={message.created_tz}
          options={{ hour: "numeric", minute: "2-digit" }}
          className="text-neutral-400"
        />
      </div>

      <div
        className="relative w-full overflow-x-clip"
        style={{ display: "flex", justifyContent: isMine ? "flex-end" : "flex-start" }}
      >
        <div
          onPointerDown={onBubblePointerDown}
          onPointerMove={onBubblePointerMove}
          onPointerUp={onBubblePointerUp}
          onPointerCancel={resetGesture}
          onPointerLeave={() => {
            if (gestureRef.current !== "swipe") resetGesture();
          }}
          onClickCapture={onBubbleClickCapture}
          onContextMenu={(e) => e.preventDefault()}
          style={{
            transform: `translateX(${swipeOffset}px)`,
            transition: isSwiping ? "none" : "transform 0.2s ease-out",
          }}
          className={`relative max-w-[78%] select-none rounded-2xl px-4 py-2.5 ${
            isMine ? "bg-blue-500 text-white" : "bg-neutral-200 text-neutral-900"
          }`}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-neutral-100 text-neutral-500"
            style={{
              left: "-40px",
              opacity: Math.min(1, swipeOffset / SWIPE_THRESHOLD),
              transition: isSwiping ? "none" : "opacity 0.2s ease-out",
            }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" />
            </svg>
          </span>
          {heartCount > 0 || replyCount > 0 ? (
            <div
              className={`absolute -top-4 flex items-center ${
                isMine ? "-left-2" : "-right-2"
              }`}
            >
              {heartCount > 0 ? (
                <div
                  className={`pointer-events-none relative z-10 flex h-6 items-center justify-center gap-0.5 rounded-full bg-white text-[11px] shadow-md ${
                    heartCount > 1 ? "min-w-6 px-1.5" : "w-6"
                  }`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-4 w-4 text-rose-500"
                    aria-hidden
                  >
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                  {heartCount > 1 ? (
                    <span className="font-medium text-neutral-600">{heartCount}</span>
                  ) : null}
                </div>
              ) : null}
              {replyCount > 0 ? (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleReplyTarget(message.id);
                  }}
                  aria-label={`${replyCount} ${replyCount === 1 ? "reply" : "replies"}`}
                  className={`relative z-0 flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full bg-white px-1.5 text-[11px] shadow-md active:scale-95 ${
                    heartCount > 0 ? "-ml-1.5" : ""
                  }`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-3 w-3 text-neutral-500"
                    aria-hidden
                  >
                    <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" />
                  </svg>
                  <span className="font-medium text-neutral-600">{replyCount}</span>
                </button>
              ) : null}
            </div>
          ) : null}
          {body || reference ? (
            <div className="flex items-center gap-3">
              {hasAudio ? (
                <button
                  onClick={togglePlay}
                  aria-label={isPlaying ? "Pause audio" : "Play audio"}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full active:scale-95 ${
                    isMine
                      ? "bg-white/20 text-white"
                      : "bg-neutral-300/70 text-neutral-700"
                  }`}
                >
                  {isPlaying ? (
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                      <rect x="6" y="5" width="4" height="14" rx="1" />
                      <rect x="14" y="5" width="4" height="14" rx="1" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                      <path d="M8 5v14l12-7z" />
                    </svg>
                  )}
                </button>
              ) : (
                <span
                  aria-hidden
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-serif text-base italic ${
                    isMine ? "bg-white/20 text-white" : "bg-neutral-300/70 text-neutral-700"
                  }`}
                >
                  t
                </span>
              )}
              {reference ? (
                referenceHref ? (
                  <a
                    href={referenceHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    onPointerDown={(e) => e.stopPropagation()}
                    className={`text-sm font-semibold ${
                      isMine
                        ? "text-white active:text-white/70"
                        : "text-neutral-900 active:text-neutral-500"
                    }`}
                  >
                    {reference}
                  </a>
                ) : (
                  <div
                    className={`text-sm font-semibold ${
                      isMine ? "text-white" : "text-neutral-900"
                    }`}
                  >
                    {reference}
                  </div>
                )
              ) : null}
            </div>
          ) : null}
          {body ? (
            <p className="mt-2 whitespace-pre-wrap text-[15px] leading-snug">
              {body}
            </p>
          ) : null}
          {hasAudio ? (
            <audio
              ref={audioRef}
              src={message.voice_signed_url ?? undefined}
              preload="metadata"
              className="hidden"
            />
          ) : null}
        </div>
      </div>

      {isReplyTarget && replyCount > 0 ? (
        <div className={`mt-1 flex w-full flex-col gap-1 ${isMine ? "items-end" : "items-start"}`}>
          {replies.map((r) => (
            <div
              key={r.id}
              className="max-w-[70%] rounded-xl bg-white px-3 py-1.5 text-sm text-neutral-700 shadow-sm"
            >
              <span className="mr-1 font-medium text-neutral-500">
                {r.profile?.display_name ?? "Someone"}:
              </span>
              {r.body_text}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
