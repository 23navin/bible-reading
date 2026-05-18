import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import HomeView, { type ChatSummary, type Me, type Member } from "./HomeView";

export const dynamic = "force-dynamic";

type MembershipRow = {
  chat_id: string;
  chats:
    | {
        id: string;
        name: string | null;
        created_at: string;
        chat_members: { profiles: Member | Member[] | null }[] | null;
      }
    | {
        id: string;
        name: string | null;
        created_at: string;
        chat_members: { profiles: Member | Member[] | null }[] | null;
      }[]
    | null;
};

export default async function HomePage() {
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profileRow }, { data: memberships }, { data: unreadRows }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, display_name")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("chat_members")
        .select("chat_id, chats(id, name, created_at, chat_members(profiles(id, display_name)))")
        .eq("user_id", user.id),
      supabase.rpc("unread_chat_ids_for_me"),
    ]);

  const unreadSet = new Set<string>(
    ((unreadRows ?? []) as string[]).filter((id): id is string => typeof id === "string"),
  );

  const chatIds = ((memberships ?? []) as MembershipRow[])
    .map((row) => {
      const chat = Array.isArray(row.chats) ? row.chats[0] : row.chats;
      return chat?.id ?? null;
    })
    .filter((id): id is string => typeof id === "string");

  const lastMessageAt = new Map<string, string>();
  if (chatIds.length > 0) {
    const { data: shareRows } = await supabase
      .from("message_shares")
      .select("chat_id, created_at")
      .in("chat_id", chatIds)
      .order("created_at", { ascending: false });
    for (const row of (shareRows ?? []) as { chat_id: string; created_at: string }[]) {
      if (!lastMessageAt.has(row.chat_id)) lastMessageAt.set(row.chat_id, row.created_at);
    }
  }

  const me: Me = {
    id: user.id,
    username: profileRow?.username ?? null,
    display_name: profileRow?.display_name ?? profileRow?.username ?? null,
  };

  const chats: ChatSummary[] = ((memberships ?? []) as MembershipRow[])
    .map((row): ChatSummary | null => {
      const chat = Array.isArray(row.chats) ? row.chats[0] : row.chats;
      if (!chat) return null;
      const members: Member[] = (chat.chat_members ?? [])
        .map((cm) => (Array.isArray(cm.profiles) ? cm.profiles[0] : cm.profiles))
        .filter((p): p is Member => p !== null && p !== undefined);
      const others = members.filter((m) => m.id !== user.id);
      return {
        id: chat.id,
        name: chat.name ?? "Untitled",
        members: others.length > 0 ? others : members,
        hasUnread: unreadSet.has(chat.id),
        lastMessageAt: lastMessageAt.get(chat.id) ?? null,
        createdAt: chat.created_at,
      };
    })
    .filter((c): c is ChatSummary => c !== null)
    .sort(
      (a, b) =>
        Date.parse(b.lastMessageAt ?? b.createdAt) -
        Date.parse(a.lastMessageAt ?? a.createdAt),
    );

  return <HomeView me={me} chats={chats} />;
}
