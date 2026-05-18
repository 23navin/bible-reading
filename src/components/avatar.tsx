import type { Member } from "@/lib/types";

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
