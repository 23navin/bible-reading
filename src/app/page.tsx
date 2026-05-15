import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import HomeRecorder, { type ChatOption } from "./HomeRecorder";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rows } = await supabase
    .from("chat_members")
    .select("chat_id, chats(id, name)")
    .eq("user_id", user.id);

  const chats: ChatOption[] = (rows ?? [])
    .map((row) => {
      const chat = Array.isArray(row.chats) ? row.chats[0] : row.chats;
      return chat ? { id: chat.id, name: chat.name ?? "Untitled chat" } : null;
    })
    .filter((c): c is ChatOption => c !== null);

  return <HomeRecorder userId={user.id} chats={chats} />;
}
