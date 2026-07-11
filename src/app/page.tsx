import { requireUser } from "@/lib/auth/session";
import {
  flattenMemberships,
  MEMBERSHIPS_SELECT,
  type ChatActivity,
  type MembershipRow,
} from "@/lib/db/chats";
import { ProfileCookieSync } from "@/components/profile-cookie";
import HomeView from "./_components/home-view";
import {
  bibleComUrl,
  formatEntryPassage,
  type NextReading,
} from "@/lib/reading-plan";
import type { ChatSummary, Me } from "@/lib/types";

export const dynamic = "force-dynamic";

type SummaryRow = ChatActivity & { chat_id: string };

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { supabase, user } = await requireUser();

  const [{ data: profileRow }, { data: memberships }, { data: summaryRows }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, display_name, reading_plan_id, bible_translation")
        .eq("id", user.id)
        .maybeSingle(),
      supabase.from("chat_members").select(MEMBERSHIPS_SELECT).eq("user_id", user.id),
      // Per-chat newest-share timestamp + unread flag in one aggregate
      // (migration 0017) instead of scanning every share row here.
      supabase.rpc("chat_summaries_for_me"),
    ]);

  const activity = new Map<string, ChatActivity>(
    ((summaryRows ?? []) as SummaryRow[]).map((row) => [row.chat_id, row]),
  );

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
        href: bibleComUrl(next, profileRow?.bible_translation),
      };
    }
  }

  const chats: ChatSummary[] = flattenMemberships(
    (memberships ?? []) as MembershipRow[],
    user.id,
    activity,
  );

  return (
    <>
      <HomeView me={me} chats={chats} nextReading={nextReading} error={error} />
      <ProfileCookieSync id={me.id} name={me.display_name} planId={planId} />
    </>
  );
}
