import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type ChatRow = { id: string; name: string | null };

export default async function ChatsListPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("chat_members")
    .select("chats(id, name)")
    .eq("user_id", user.id);

  const chats: ChatRow[] = (memberships ?? [])
    .map((row) => (Array.isArray(row.chats) ? row.chats[0] : row.chats))
    .filter((c): c is ChatRow => c !== null);

  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-blue-500 active:text-blue-700">
            ← Home
          </Link>
          <h1 className="text-base font-semibold">Chats</h1>
        </div>
        <Link
          href="/chats/new"
          className="text-sm font-medium text-blue-500 active:text-blue-700"
        >
          New
        </Link>
      </header>

      <div className="flex-1 overflow-y-auto">
        {chats.length === 0 ? (
          <p className="mt-12 text-center text-sm text-stone-400">
            No chats yet. Tap “New” to start one.
          </p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {chats.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/chat/${c.id}`}
                  className="flex items-center gap-3 px-4 py-3 active:bg-stone-50"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-200 text-stone-600">
                    💬
                  </div>
                  <div className="flex-1">
                    <div className="text-base font-medium">{c.name ?? "Untitled"}</div>
                  </div>
                  <span className="text-stone-300">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
