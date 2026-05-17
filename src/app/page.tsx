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
        chat_members: { profiles: Member | Member[] | null }[] | null;
      }
    | {
        id: string;
        name: string | null;
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
        .select("chat_id, chats(id, name, chat_members(profiles(id, display_name)))")
        .eq("user_id", user.id),
      supabase.rpc("unread_chat_ids_for_me"),
    ]);

  const unreadSet = new Set<string>(
    ((unreadRows ?? []) as string[]).filter((id): id is string => typeof id === "string"),
  );

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
      };
    })
    .filter((c): c is ChatSummary => c !== null);

  return <HomeView me={me} chats={chats} />;
}
