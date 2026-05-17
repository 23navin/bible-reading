import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import { signAudioPaths } from "@/lib/audio";
import type { Message } from "@/lib/types";
import type { Member } from "@/app/home-shared";
import ChatView from "../ChatView";

export const dynamic = "force-dynamic";

export default async function ChatRoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: chatId } = await params;
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Share-link flow: idempotently self-join (if not already a member) and
  // return the chat row in one round trip. SECURITY DEFINER inside the RPC
  // bypasses RLS so the post-insert read sees the new membership without
  // depending on policy evaluation across separate HTTP requests — and a
  // single POST avoids Next's per-render GET memoization, which previously
  // dedup'd a post-insert re-read to a pre-insert null result.
  const { data: chatRows } = await supabase.rpc("join_chat_via_link", {
    p_chat_id: chatId,
  });
  const chat = (chatRows ?? [])[0] as { id: string; name: string | null } | undefined;

  if (!chat) {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-base text-stone-500">Chat not found.</p>
        <Link href="/chats" className="text-sm font-medium text-blue-500">
          Back to chats
        </Link>
      </main>
    );
  }

  await supabase.rpc("mark_chat_read", { p_chat_id: chatId });

  const { data: memberRows } = await supabase
    .from("chat_members")
    .select("profiles(id, display_name)")
    .eq("chat_id", chatId);

  type MemberRow = { profiles: Member | Member[] | null };
  const allMembers: Member[] = (memberRows ?? [])
    .map((row) => {
      const p = (row as unknown as MemberRow).profiles;
      return Array.isArray(p) ? p[0] : p;
    })
    .filter((p): p is Member => p !== null && p !== undefined);
  const others = allMembers.filter((m) => m.id !== user.id);
  const members: Member[] = others.length > 0 ? others : allMembers;

  // Pull all message_shares for this chat, joined to the full message + author + reactions + replies.
  const { data: shareRows } = await supabase
    .from("message_shares")
    .select(
      `created_at,
       messages (
         id, user_id, reference, book, chapter, verse_start, verse_end,
         note, voice_path, transcript, created_at,
         profile:profiles!messages_user_id_fkey(id, display_name),
         reactions(message_id, user_id, emoji),
         replies(id, message_id, user_id, body_text, created_at, profile:profiles!replies_user_id_fkey(id, display_name))
       )`,
    )
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })
    .limit(200);

  type ShareRow = { messages: Message | Message[] | null };
  const baseMessages: Message[] = (shareRows ?? [])
    .map((row) => {
      const m = (row as unknown as ShareRow).messages;
      return Array.isArray(m) ? m[0] : m;
    })
    .filter((m): m is Message => m !== null)
    .map((m) => ({ ...m, chat_id: chatId }));

  const signedUrls = await signAudioPaths(
    supabase,
    baseMessages.map((m) => m.voice_path),
  );
  const messages = baseMessages.map((m) => ({
    ...m,
    voice_signed_url: m.voice_path ? signedUrls[m.voice_path] ?? null : null,
  }));

  return (
    <ChatView
      chatId={chatId}
      chatName={chat.name ?? "Chat"}
      members={members}
      currentUserId={user.id}
      initialMessages={messages}
    />
  );
}
