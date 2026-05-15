"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import { signAudioPath } from "@/lib/audio";
import type { Message, Profile, Reaction, Reply } from "@/lib/types";
import MessageBubble from "./MessageBubble";
import Composer from "./Composer";

type Props = {
  chatId: string;
  chatName: string;
  currentUserId: string;
  initialMessages: Message[];
};

export default function ChatView({ chatId, chatName, currentUserId, initialMessages }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [supabase] = useState(() => createClient());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    const fetchProfile = async (userId: string): Promise<Profile | null> => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name")
        .eq("id", userId)
        .maybeSingle();
      return (data as Profile | null) ?? null;
    };

    const fetchMessage = async (messageId: string): Promise<Message | null> => {
      const { data } = await supabase
        .from("messages")
        .select(
          "id, user_id, reference, book, chapter, verse_start, verse_end, note, voice_path, transcript, created_at, profile:profiles!messages_user_id_fkey(id, display_name), reactions(message_id, user_id, emoji), replies(id, message_id, user_id, body_text, created_at, profile:profiles!replies_user_id_fkey(id, display_name))",
        )
        .eq("id", messageId)
        .maybeSingle();
      if (!data) return null;
      const msg = { ...(data as unknown as Message), chat_id: chatId };
      msg.voice_signed_url = await signAudioPath(supabase, msg.voice_path);
      return msg;
    };

    const channel = supabase
      .channel(`chat:${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_shares",
          filter: `chat_id=eq.${chatId}`,
        },
        async (payload) => {
          const messageId = (payload.new as { message_id: string }).message_id;
          const msg = await fetchMessage(messageId);
          if (!msg) return;
          setMessages((prev) =>
            prev.some((x) => x.id === msg.id) ? prev : [...prev, msg],
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "message_shares",
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          const messageId = (payload.old as { message_id: string }).message_id;
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reactions" },
        (payload) => {
          const r = payload.new as Reaction;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === r.message_id
                ? { ...m, reactions: [...(m.reactions ?? []), r] }
                : m,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "reactions" },
        (payload) => {
          const r = payload.old as Reaction;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === r.message_id
                ? {
                    ...m,
                    reactions: (m.reactions ?? []).filter(
                      (x) => x.user_id !== r.user_id,
                    ),
                  }
                : m,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "replies" },
        async (payload) => {
          const r = payload.new as Reply;
          const profile = await fetchProfile(r.user_id);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === r.message_id
                ? { ...m, replies: [...(m.replies ?? []), { ...r, profile }] }
                : m,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, supabase]);

  const addOptimisticMessage = (m: Message) => {
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
  };

  const reconcileMessageId = (optimisticId: string, realId: string) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === realId)) {
        return prev.filter((m) => m.id !== optimisticId);
      }
      return prev.map((m) => (m.id === optimisticId ? { ...m, id: realId } : m));
    });
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-stone-200 bg-white/80 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link href="/chats" className="text-blue-500 active:text-blue-700">
            ←
          </Link>
          <div>
            <h1 className="text-base font-semibold">{chatName}</h1>
            <p className="text-xs text-stone-500">
              {messages.length} message{messages.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <Link href="/" className="text-sm text-stone-500 active:text-stone-700">
          Home
        </Link>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4">
        <div className="flex flex-col gap-3">
          {messages.length === 0 ? (
            <p className="mt-12 text-center text-sm text-stone-400">
              No messages here yet. Share something from your archive or record below.
            </p>
          ) : (
            messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                isMine={m.user_id === currentUserId}
                currentUserId={currentUserId}
              />
            ))
          )}
        </div>
      </div>

      <Composer
        chatId={chatId}
        currentUserId={currentUserId}
        onOptimistic={addOptimisticMessage}
        onReconcile={reconcileMessageId}
      />
    </div>
  );
}
