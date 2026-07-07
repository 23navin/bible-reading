import { CookieDisplayName } from "@/components/profile-cookie";
import { ProfileFrame, NameSkeleton } from "@/components/profile-frame";

export default function Loading() {
  return (
    <ProfileFrame
      tab="plan"
      name={<CookieDisplayName fallback={<NameSkeleton />} />}
      contentClassName="px-8"
    >
      <div className="flex animate-pulse flex-col gap-1">
        {[16, 40, 32, 36].map((width, i) => (
          <div key={i} className="flex items-center py-2">
            <div
              className="h-7 rounded bg-zinc-800"
              style={{ width: `${width}%` }}
            />
          </div>
        ))}
      </div>

      <ul className="-mx-4 mt-8 flex animate-pulse flex-col gap-3 pb-8">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="rounded-2xl bg-zinc-800/40 px-4 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="h-5 w-24 rounded bg-zinc-800" />
              <div className="h-4 w-12 rounded bg-zinc-800" />
            </div>
          </li>
        ))}
      </ul>
    </ProfileFrame>
  );
}
