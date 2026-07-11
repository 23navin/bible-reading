import type { ChatSummary, Member } from "@/lib/types";

// PostgREST returns to-one embeds as object-or-array depending on how it
// detects the relationship, so unwrap both shapes.
export function one<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export type MembershipChat = {
  id: string;
  name: string | null;
  created_at: string;
  chat_members: { profiles: Member | Member[] | null }[] | null;
};

export type MembershipRow = { chats: MembershipChat | MembershipChat[] | null };

// Select string for a user's chat list with per-chat member profiles.
export const MEMBERSHIPS_SELECT =
  "chats(id, name, created_at, chat_members(profiles(id, display_name)))";

export type ChatActivity = {
  last_message_at: string | null;
  has_unread: boolean;
};

// Everyone in the chat except the viewer, falling back to all members for a
// self-only chat (so it doesn't render as empty).
export function flattenMembers(
  rows: { profiles: Member | Member[] | null }[],
  userId: string,
): Member[] {
  const all = rows
    .map((row) => one(row.profiles))
    .filter((p): p is Member => p !== null);
  const others = all.filter((m) => m.id !== userId);
  return others.length > 0 ? others : all;
}

// chat_members rows -> ChatSummary[], newest activity first. `activity`
// (from the chat_summaries_for_me RPC) is optional: without it, chats sort
// by creation time and carry no unread state — the shape /plan's share list
// wants.
export function flattenMemberships(
  rows: MembershipRow[] | null,
  userId: string,
  activity?: Map<string, ChatActivity>,
): ChatSummary[] {
  return (rows ?? [])
    .map((row): ChatSummary | null => {
      const chat = one(row.chats);
      if (!chat) return null;
      return {
        id: chat.id,
        name: chat.name ?? "Untitled",
        members: flattenMembers(chat.chat_members ?? [], userId),
        hasUnread: activity?.get(chat.id)?.has_unread ?? false,
        lastMessageAt: activity?.get(chat.id)?.last_message_at ?? null,
        createdAt: chat.created_at,
      };
    })
    .filter((c): c is ChatSummary => c !== null)
    .sort(
      (a, b) =>
        Date.parse(b.lastMessageAt ?? b.createdAt) -
        Date.parse(a.lastMessageAt ?? a.createdAt),
    );
}
