import Link from "next/link";
import { createChat } from "./actions";

export default async function NewChatPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-stone-200 bg-white px-4 py-3">
        <Link href="/chats" className="text-blue-500 active:text-blue-700">
          ← Chats
        </Link>
        <h1 className="text-base font-semibold">New chat</h1>
      </header>

      <div className="flex-1 px-5 py-6">
        <form action={createChat} className="flex flex-col gap-3">
          <input
            name="name"
            type="text"
            required
            placeholder="Chat name (e.g. Tuesday Bible study)"
            className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-base outline-none focus:border-stone-400"
          />
          <button
            type="submit"
            className="rounded-xl bg-blue-500 px-4 py-3 text-base font-semibold text-white active:bg-blue-600"
          >
            Create
          </button>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <p className="text-xs text-stone-500">
            You can invite others later by sharing the chat link.
          </p>
        </form>
      </div>
    </main>
  );
}
