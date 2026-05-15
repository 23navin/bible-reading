"use client";

export type Member = { id: string; display_name: string | null };
export type ChatSummary = {
  id: string;
  name: string;
  members: Member[];
  hasUnread: boolean;
};
export type Me = {
  id: string;
  username: string | null;
  display_name: string | null;
};

export type ParsedPassage = {
  book: string | null;
  chapter: number | null;
  verse_start: number | null;
  verse_end: number | null;
  reference: string | null;
};

export function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={className}
      aria-hidden
    >
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function ShareTargets({
  chats,
  selected,
  onToggle,
}: {
  chats: ChatSummary[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
        Also share to
      </p>
      {chats.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No chats yet — this will save to your archive only.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {chats.map((c) => {
            const on = selected.has(c.id);
            return (
              <button
                key={c.id}
                onClick={() => onToggle(c.id)}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  on
                    ? "border-blue-500 bg-blue-500 text-white"
                    : "border-zinc-700 bg-zinc-800 text-zinc-200"
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      )}
      <p className="mt-2 text-xs text-zinc-500">
        {selected.size === 0
          ? "Saves to your archive only."
          : `Saves to archive + ${selected.size} chat${selected.size === 1 ? "" : "s"}.`}
      </p>
    </div>
  );
}
