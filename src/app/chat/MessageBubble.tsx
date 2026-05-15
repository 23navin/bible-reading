"use client";

import { useState } from "react";
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
  const body = message.note ?? message.transcript;
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
        {reference ? (
          <div className={`text-sm font-semibold ${isMine ? "text-white" : "text-stone-900"}`}>
            {reference}
          </div>
        ) : null}
        {body ? (
          <p className={`whitespace-pre-wrap text-[15px] leading-snug ${reference ? "mt-1" : ""}`}>
            {body}
          </p>
        ) : null}
        {message.voice_signed_url ? (
          <audio
            controls
            src={message.voice_signed_url}
            className="mt-2 h-9 w-full"
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
