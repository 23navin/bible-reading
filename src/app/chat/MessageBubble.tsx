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
        className={`max-w-[78%] rounded-2xl px-4 py-2.5 ${
          isMine ? "bg-blue-500 text-white" : "bg-stone-200 text-stone-900"
        }`}
      >
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
          onClick={toggleHeart}
          className={`active:scale-95 ${heart ? "text-red-500" : "text-stone-400"}`}
          aria-label="React with heart"
        >
          ❤️ {heartCount > 0 ? heartCount : ""}
        </button>
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
