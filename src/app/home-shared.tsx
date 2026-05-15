"use client";

import { useEffect, useState } from "react";

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

export function DiscardButton({ onDiscard }: { onDiscard: () => void }) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(id);
  }, [confirming]);

  return (
    <button
      type="button"
      onClick={() => {
        if (confirming) onDiscard();
        else setConfirming(true);
      }}
      aria-label={confirming ? "Confirm discard" : "Discard"}
      style={{ borderRadius: 8 }}
      className={`flex h-10 shrink-0 items-center justify-center border transition-all duration-200 ease-out ${
        confirming
          ? "w-24 border-red-500 bg-red-500 text-white"
          : "w-10 border-zinc-700 bg-zinc-800 text-zinc-300 active:bg-zinc-700"
      }`}
    >
      {confirming ? (
        <span className="text-sm font-semibold leading-none">Discard</span>
      ) : (
        <CloseIcon className="h-5 w-5" />
      )}
    </button>
  );
}

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
      <p className="text-sm font-medium tracking-wide text-zinc-200">
        Share With
      </p>
      {chats.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No chats yet — this will save to your personal log only.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {chats.map((c) => {
            const on = selected.has(c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onToggle(c.id)}
                  aria-pressed={on}
                  className={`flex w-full items-center gap-3 rounded-md py-2 pr-2 text-left active:bg-zinc-800 ${
                    on ? "bg-zinc-800" : ""
                  }`}
                >
                  <span className="mx-3 text-lg text-zinc-100">{c.name}</span>
                  <AvatarStack members={c.members} />
                  <span className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center">
                    {on ? (
                      <CheckIcon className="h-5 w-5 text-red-200" />
                    ) : (
                      <span className="block h-4 w-4 rounded-xs border border-zinc-600" />
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-xs text-zinc-500">
        {selected.size === 0
          ? "Saves to your personal log only."
          : `Saves to your personal log + Shares with ${selected.size} chat${selected.size === 1 ? "" : "s"}.`}
      </p>
    </div>
  );
}

export function AvatarStack({ members }: { members: Member[] }) {
  const shown = members.slice(0, 4);
  const overflow = members.length - shown.length;
  return (
    <div className="ml-1 flex items-center">
      {shown.map((m, i) => (
        <div
          key={m.id}
          style={{
            marginLeft: i === 0 ? 0 : -10,
            zIndex: shown.length - i,
            borderRadius: 8,
          }}
          className="ring-2 ring-zinc-900"
        >
          <Avatar name={m.display_name ?? "?"} id={m.id} size={28} />
        </div>
      ))}
      {overflow > 0 ? (
        <div
          style={{ marginLeft: -10, zIndex: 0, borderRadius: 8 }}
          className="flex h-7 w-7 items-center justify-center bg-zinc-700 text-[10px] font-semibold text-zinc-200 ring-2 ring-zinc-900"
        >
          +{overflow}
        </div>
      ) : null}
    </div>
  );
}

export function Avatar({
  name,
  id,
  size,
}: {
  name: string;
  id: string;
  size: number;
}) {
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();
  const bg = avatarColor(id);
  return (
    <div
      style={{ width: size, height: size, backgroundColor: bg, fontSize: size * 0.42, borderRadius: 8 }}
      className="flex items-center justify-center font-semibold text-white select-none"
    >
      {initial}
    </div>
  );
}

const AVATAR_PALETTE = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
  "#6366f1",
  "#a855f7",
  "#ec4899",
];
function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}
