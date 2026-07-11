"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/db/client";
import { signAudioPath } from "@/lib/audio/storage";
import type { Member, Message, Profile, Reaction, Reply } from "@/lib/types";
import { AvatarStack } from "@/components/avatar";
import { Shell, Header, Body, Footer } from "@/components/shell";
import { ChevronLeftIcon } from "@/components/icons";
import { useHydrated } from "@/components/local-time";
import { dayKey, formatDateDivider } from "@/lib/format";
import MessageBubble from "./message-bubble";
import Composer from "./composer";

type Props = {
  chatId: string;
  chatName: string;
  members: Member[];
  currentUserId: string;
  initialMessages: Message[];
  translation: string | null;
};

export default function ChatView({ chatId, chatName, members, currentUserId, initialMessages, translation }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [supabase] = useState(() => createClient());
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLElement>(null);
  // Day grouping depends on the viewer's timezone, so dividers can only be
  // computed after hydration.
  const hydrated = useHydrated();

  const replyTarget = replyTargetId
    ? messages.find((m) => m.id === replyTargetId) ?? null
    : null;

  // Stable identity so React.memo on MessageBubble holds across list updates.
  const toggleReplyTarget = useCallback((id: string) => {
    setReplyTargetId((prev) => (prev === id ? null : id));
  }, []);

  const clearReplyTarget = () => setReplyTargetId(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    const fetchMessage = async (messageId: string): Promise<Message | null> => {
      const { data } = await supabase
        .from("messages")
        .select(
          "id, user_id, reference, book, chapter, verse_start, verse_end, note, voice_path, transcript, created_at, created_tz, profile:profiles!messages_user_id_fkey(id, display_name), reactions(message_id, user_id, emoji), replies(id, message_id, user_id, body_text, created_at, profile:profiles!replies_user_id_fkey(id, display_name))",
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, supabase]);

  // Reactions/replies arrive on a second channel scoped to the messages on
  // screen. Realtime INSERT filters only support `in.(...)` with up to 100
  // values, so subscribe to the newest 100 real (non-optimistic) message ids;
  // reactions on anything older don't update live (a reload still shows
  // them). The channel resubscribes when the id set changes (new message) —
  // a sub-second gap, acceptable at this app's traffic. At larger scale,
  // switch to realtime.broadcast_changes() fan-out per chat topic.
  const messageIdKey = useMemo(
    () =>
      messages
        .map((m) => m.id)
        .filter((id) => !id.startsWith("tmp-"))
        .slice(-100)
        .join(","),
    [messages],
  );

  useEffect(() => {
    if (!messageIdKey) return;

    const fetchProfile = async (userId: string): Promise<Profile | null> => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name")
        .eq("id", userId)
        .maybeSingle();
      return (data as Profile | null) ?? null;
    };

    const channel = supabase
      .channel(`chat-meta:${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "reactions",
          filter: `message_id=in.(${messageIdKey})`,
        },
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
        // Supabase realtime cannot filter DELETE events, so this one stays
        // table-wide and matches by message id client-side.
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
        {
          event: "INSERT",
          schema: "public",
          table: "replies",
          filter: `message_id=in.(${messageIdKey})`,
        },
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
  }, [chatId, supabase, messageIdKey]);

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
      <Header className="flex items-center bg-neutral-900 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <Link
          href="/"
          aria-label="Home"
          className="-m-2 flex h-10 w-10 items-center justify-center text-neutral-300 active:text-neutral-100"
        >
          <ChevronLeftIcon className="h-6 w-6" />
        </Link>
        <div className="flex flex-1 items-center justify-center gap-2">
          <span className="truncate text-base font-medium text-neutral-100">
            {chatName}
          </span>
          {members.length > 0 ? <AvatarStack members={members} /> : null}
        </div>
        <span aria-hidden className="h-10 w-10" />
      </Header>

      <Body ref={scrollRef} className="px-3 py-4">
        <div className="flex flex-col gap-3">
          {messages.length === 0 ? (
            <p className="mt-12 text-center text-sm text-neutral-400">
              No messages here yet. Share something from your archive or record below.
            </p>
          ) : (
            messages.map((m, i) => {
              const prev = i > 0 ? messages[i - 1] : null;
              const showDivider =
                hydrated && (!prev || dayKey(prev.created_at) !== dayKey(m.created_at));
              return (
                <div key={m.id} className="flex flex-col gap-3">
                  {showDivider && (
                    <div className="flex justify-center py-1">
                      <span className="text-sm text-neutral-400">
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
                    translation={translation}
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
