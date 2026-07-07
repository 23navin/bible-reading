import { CookieDisplayName } from "@/components/profile-cookie";
import { ProfileFrame, NameSkeleton } from "@/components/profile-frame";

export default function Loading() {
  return (
    <ProfileFrame
      tab="account"
      name={<CookieDisplayName fallback={<NameSkeleton />} />}
      contentClassName="flex animate-pulse flex-col gap-8 px-8"
    >
      <section className="flex flex-col gap-2">
        <div className="h-7 w-3/5 rounded bg-neutral-800" />
        <div className="h-5 w-2/5 rounded bg-neutral-800" />
      </section>

      <div className="h-12 w-full rounded-md bg-neutral-800" />
    </ProfileFrame>
  );
}
