import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/db/server";
import { ProfileCookieSync } from "@/components/profile-cookie";
import HomeView from "./_components/home-view";
import {
  bibleComUrl,
  formatEntryPassage,
  type NextReading,
} from "@/lib/reading-plan";
import type { ChatSummary, Me, Member } from "@/lib/types";

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
        .select("id, username, display_name, reading_plan_id")
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

  let nextReading: NextReading | null = null;
  const planId: string | null = profileRow?.reading_plan_id ?? null;
  if (planId) {
    const [{ data: entries }, { data: progress }] = await Promise.all([
      supabase
        .from("reading_plan_entries")
        .select("date, begin_chapter, end_chapter")
        .eq("plan_id", planId)
        .order("date", { ascending: true }),
      supabase
        .from("reading_plan_progress")
        .select("date")
        .eq("user_id", user.id)
        .eq("plan_id", planId),
    ]);
    const done = new Set((progress ?? []).map((p: { date: string }) => p.date));
    const next = (entries ?? []).find((e: { date: string }) => !done.has(e.date)) ?? null;
    if (next) {
      nextReading = {
        date: next.date,
        passage: formatEntryPassage(next),
        href: bibleComUrl(next),
      };
    }
  }

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

  return (
    <>
      <HomeView me={me} chats={chats} nextReading={nextReading} />
      <ProfileCookieSync id={me.id} name={me.display_name} />
    </>
  );
}
