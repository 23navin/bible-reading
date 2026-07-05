// Assumed Supabase schema. Adjust column names here if your tables differ.

export type Profile = {
  id: string;
  display_name: string | null;
};

export type Reaction = {
  message_id: string;
  user_id: string;
  emoji: string;
};

export type Reply = {
  id: string;
  message_id: string;
  user_id: string;
  body_text: string;
  created_at: string;
  profile?: Profile | null;
};

export type Message = {
  id: string;
  // Optional. Messages no longer belong to a chat directly — they're linked via message_shares.
  // This field is only populated on the client when we know which chat surfaced the message.
  chat_id?: string;
  user_id: string;
  reference: string | null;
  book: string | null;
  chapter: number | null;
  verse_start: number | null;
  verse_end: number | null;
  note: string | null;
  voice_path: string | null;
  // Mint at render time via Supabase signed URL. Not stored in DB.
  voice_signed_url?: string | null;
  transcript: string | null;
  created_at: string;
  // IANA timezone of the author's device at creation time; null on rows
  // predating the column.
  created_tz: string | null;
  profile?: Profile | null;
  reactions?: Reaction[];
  replies?: Reply[];
};

export type Member = { id: string; display_name: string | null };

export type Me = {
  id: string;
  username: string | null;
  display_name: string | null;
};

export type ChatSummary = {
  id: string;
  name: string;
  members: Member[];
  hasUnread: boolean;
  lastMessageAt: string | null;
  createdAt: string;
};
