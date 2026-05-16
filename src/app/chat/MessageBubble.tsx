"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { Message } from "@/lib/types";

type Props = {
  message: Message;
  isMine: boolean;
  currentUserId: string;
};

export default function MessageBubble({ message, isMine, currentUserId }: Props) {
  const supabase = createClient();
  const [replyText, setReplyText] = useState("");
  const [showReply, setShowReply] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

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

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pointerStartRef.current = null;
  };

  const onBubblePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    longPressFiredRef.current = false;
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    clearLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressFiredRef.current = true;
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(15);
      }
      toggleHeart();
    }, 200);
  };

  const onBubblePointerMove = (e: React.PointerEvent) => {
    const start = pointerStartRef.current;
    if (!start) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) {
      clearLongPress();
    }
  };

  const onBubbleClickCapture = (e: React.MouseEvent) => {
    if (longPressFiredRef.current) {
      e.stopPropagation();
      e.preventDefault();
      longPressFiredRef.current = false;
    }
  };

  const sendReply = async () => {
    const body = replyText.trim();
    if (!body) return;
    setReplyText("");
    setShowReply(false);
    await supabase
      .from("replies")
      .insert({ message_id: message.id, user_id: currentUserId, body_text: body });
  };

  const reference = message.reference;
  const body = message.transcript ?? message.note;
  const hasAudio = Boolean(message.voice_signed_url);
  const authorName = message.profile?.display_name ?? "Someone";
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
      {!isMine ? (
        <span className="mb-0.5 ml-3 text-xs text-stone-500">{authorName}</span>
      ) : null}

      <div
        onPointerDown={onBubblePointerDown}
        onPointerMove={onBubblePointerMove}
        onPointerUp={clearLongPress}
        onPointerCancel={clearLongPress}
        onPointerLeave={clearLongPress}
        onClickCapture={onBubbleClickCapture}
        onContextMenu={(e) => e.preventDefault()}
        className={`relative max-w-[78%] select-none rounded-2xl px-4 py-2.5 ${
          isMine ? "bg-blue-500 text-white" : "bg-stone-200 text-stone-900"
        } ${heartCount > 0 ? "mt-3" : ""}`}
      >
        {heartCount > 0 ? (
          <div
            className={`pointer-events-none absolute -top-3 flex h-6 items-center justify-center gap-0.5 rounded-full bg-white text-[11px] shadow-md ring-1 ring-stone-200 ${
              heartCount > 1 ? "min-w-6 px-1.5" : "w-6"
            } ${isMine ? "-left-2" : "-right-2"}`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-3.5 w-3.5 text-rose-500"
              aria-hidden
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            {heartCount > 1 ? (
              <span className="font-medium text-stone-600">{heartCount}</span>
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
                    : "bg-stone-300/70 text-stone-700"
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
                  isMine ? "bg-white/20 text-white" : "bg-stone-300/70 text-stone-700"
                }`}
              >
                t
              </span>
            )}
            {reference ? (
              <div
                className={`text-sm font-semibold ${
                  isMine ? "text-white" : "text-stone-900"
                }`}
              >
                {reference}
              </div>
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

      <div className={`mt-1 flex items-center gap-3 px-2 text-xs ${isMine ? "flex-row-reverse" : ""}`}>
        <span className="text-stone-400">{time}</span>
        <button
          onClick={() => setShowReply((v) => !v)}
          className="text-stone-400 active:text-stone-600"
        >
          Reply
        </button>
      </div>

      {(message.replies ?? []).length > 0 ? (
        <div className={`mt-1 flex w-full flex-col gap-1 ${isMine ? "items-end" : "items-start"}`}>
          {(message.replies ?? []).map((r) => (
            <div
              key={r.id}
              className="max-w-[70%] rounded-xl bg-white px-3 py-1.5 text-sm text-stone-700 shadow-sm"
            >
              <span className="mr-1 font-medium text-stone-500">
                {r.profile?.display_name ?? "Someone"}:
              </span>
              {r.body_text}
            </div>
          ))}
        </div>
      ) : null}

      {showReply ? (
        <div className={`mt-2 flex w-full max-w-[78%] gap-2 ${isMine ? "self-end" : ""}`}>
          <input
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                sendReply();
              }
            }}
            placeholder="Reply…"
            className="flex-1 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-stone-400"
          />
          <button
            onClick={sendReply}
            className="rounded-full bg-blue-500 px-3 py-1.5 text-sm font-medium text-white"
          >
            Send
          </button>
        </div>
      ) : null}
    </div>
  );
}
