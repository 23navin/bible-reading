import { CookieDisplayName } from "@/components/profile-cookie";
import {
  ArchiveFrame,
  NameSkeleton,
  ArchiveListSkeleton,
} from "./_components/archive-frame";

export default function ArchiveLoading() {
  return (
    <ArchiveFrame name={<CookieDisplayName fallback={<NameSkeleton />} />}>
      <ArchiveListSkeleton />
    </ArchiveFrame>
  );
}
