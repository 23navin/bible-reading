"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import { signAudioPath } from "@/lib/audio";
import type { Message, Profile, Reaction, Reply } from "@/lib/types";
import { AvatarStack, type Member } from "@/app/home-shared";
import { Shell, Header, Body, Footer } from "@/app/_shell";
import MessageBubble from "./MessageBubble";
import Composer from "./Composer";

type Props = {
  chatId: string;
  chatName: string;
  members: Member[];
  currentUserId: string;
  initialMessages: Message[];
};

function formatDateDivider(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / dayMs);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function ChatView({ chatId, chatName, members, currentUserId, initialMessages }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [supabase] = useState(() => createClient());
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLElement>(null);

  const replyTarget = replyTargetId
    ? messages.find((m) => m.id === replyTargetId) ?? null
    : null;

  const toggleReplyTarget = (id: string) => {
    setReplyTargetId((prev) => (prev === id ? null : id));
  };

  const clearReplyTarget = () => setReplyTargetId(null);

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
    <Shell>
      <Header className="flex items-center bg-zinc-900 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <Link
          href="/"
          aria-label="Home"
          className="-m-2 flex h-10 w-10 items-center justify-center text-zinc-300 active:text-zinc-100"
        >
          <ChevronLeftIcon className="h-6 w-6" />
        </Link>
        <div className="flex flex-1 items-center justify-center gap-2">
          <span className="truncate text-base font-medium text-zinc-100">
            {chatName}
          </span>
          {members.length > 0 ? <AvatarStack members={members} /> : null}
        </div>
        <span aria-hidden className="h-10 w-10" />
      </Header>

      <Body ref={scrollRef} className="px-3 py-4">
        <div className="flex flex-col gap-3">
          {messages.length === 0 ? (
            <p className="mt-12 text-center text-sm text-stone-400">
              No messages here yet. Share something from your archive or record below.
            </p>
          ) : (
            messages.map((m, i) => {
              const prev = i > 0 ? messages[i - 1] : null;
              const showDivider = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
              return (
                <div key={m.id} className="flex flex-col gap-3">
                  {showDivider && (
                    <div className="flex justify-center py-1">
                      <span className="text-sm text-stone-400">
                        {formatDateDivider(m.created_at)}
                      </span>
                    </div>
                  )}
                  <MessageBubble
                    message={m}
                    isMine={m.user_id === currentUserId}
                    currentUserId={currentUserId}
                    isReplyTarget={m.id === replyTargetId}
                    onToggleReplyTarget={toggleReplyTarget}
                  />
                </div>
              );
            })
          )}
        </div>
      </Body>

      <Footer>
        <Composer
          chatId={chatId}
          currentUserId={currentUserId}
          onOptimistic={addOptimisticMessage}
          onReconcile={reconcileMessageId}
          replyTarget={replyTarget}
          onClearReplyTarget={clearReplyTarget}
        />
      </Footer>
    </Shell>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
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
      <path d="M15 18L9 12l6-6" />
    </svg>
  );
}
