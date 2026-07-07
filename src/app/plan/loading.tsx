import { CookieDisplayName } from "@/components/profile-cookie";
import { ProfileFrame, NameSkeleton } from "@/components/profile-frame";
import { PlanSkeleton } from "./_components/plan-skeleton";

export default function Loading() {
  return (
    <ProfileFrame
      tab="plan"
      name={<CookieDisplayName fallback={<NameSkeleton />} />}
      contentClassName="px-8"
    >
      <PlanSkeleton />
    </ProfileFrame>
  );
}
