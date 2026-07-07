"use client";

import type { ChatSummary } from "@/lib/types";
import { AvatarStack } from "./avatar";
import { CheckIcon } from "./icons";

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
      <p className="text-sm font-medium tracking-wide text-neutral-200">
        Share With
      </p>
      {chats.length === 0 ? (
        <p className="text-sm text-neutral-500">
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
                  className={`flex w-full items-center gap-3 rounded-md py-2 pr-2 text-left active:bg-neutral-800 ${
                    on ? "bg-neutral-800" : ""
                  }`}
                >
                  <span className="mx-3 text-lg text-neutral-100">{c.name}</span>
                  <AvatarStack members={c.members} />
                  <span className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center">
                    {on ? (
                      <CheckIcon className="h-5 w-5 text-red-200" />
                    ) : (
                      <span className="block h-4 w-4 rounded-xs border border-neutral-600" />
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-xs text-neutral-500">
        {selected.size === 0
          ? "Saves to your personal log only."
          : `Saves to your personal log + Shares with ${selected.size} chat${selected.size === 1 ? "" : "s"}.`}
      </p>
    </div>
  );
}
