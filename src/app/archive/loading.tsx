import { CookieDisplayName } from "@/components/profile-cookie";
import { ProfileFrame, NameSkeleton } from "@/components/profile-frame";
import { ArchiveListSkeleton } from "./_components/archive-skeleton";

export default function ArchiveLoading() {
  return (
    <ProfileFrame tab="log" name={<CookieDisplayName fallback={<NameSkeleton />} />}>
      <ArchiveListSkeleton />
    </ProfileFrame>
  );
}
