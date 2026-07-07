"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/db/server";
import { getAuthUser } from "@/lib/auth/user";

export async function createChat(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/?error=Name+required");

  const supabase = await createServerSupabase();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/login");

  // Generate the id locally so we don't need INSERT ... RETURNING, which would
  // require the SELECT RLS policy to make the new chat visible to its creator —
  // but the SELECT policy only admits chat members, and the creator isn't a
  // member yet (that's the next insert).
  const chatId = randomUUID();

  const { error } = await supabase
    .from("chats")
    .insert({ id: chatId, name, type: "group" });

  if (error) {
    redirect(`/?error=${encodeURIComponent(error.message)}`);
  }

  const { error: memberErr } = await supabase
    .from("chat_members")
    .insert({ chat_id: chatId, user_id: user.id });

  if (memberErr) {
    redirect(`/?error=${encodeURIComponent(memberErr.message)}`);
  }

  redirect(`/chat/${chatId}`);
}
