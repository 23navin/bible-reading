export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Whole local days from `date` to today: 0 = today, positive = past,
// negative = future.
export function daysAgo(date: Date): number {
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
}

// Plan-day label: "Today" / "Yesterday" / "Tomorrow", weekday within a week
// (either direction), otherwise "January 5" (with year if not this year).
export function formatPlanDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  const ago = daysAgo(date);
  if (ago === 0) return "Today";
  if (ago === 1) return "Yesterday";
  if (ago === -1) return "Tomorrow";
  if (Math.abs(ago) < 7) {
    return date.toLocaleDateString(undefined, { weekday: "long" });
  }
  const now = new Date();
  const label = date.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  return date.getFullYear() === now.getFullYear()
    ? label
    : `${label}, ${date.getFullYear()}`;
}

export function formatChatTimestamp(iso: string): string {
  const date = new Date(iso);
  const ago = daysAgo(date);
  if (ago <= 0) {
    return date
      .toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
      .toLowerCase();
  }
  if (ago === 1) return "yesterday";
  if (ago < 7) {
    return date
      .toLocaleDateString(undefined, { weekday: "long" })
      .toLowerCase();
  }
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const y = String(date.getFullYear() % 100).padStart(2, "0");
  return `${m}/${d}/${y}`;
}

// Chat day-divider label: "Today" / "Yesterday" / "Wed, Jun 3" (+ year when
// not this year).
export function formatDateDivider(iso: string): string {
  const date = new Date(iso);
  const ago = daysAgo(date);
  if (ago === 0) return "Today";
  if (ago === 1) return "Yesterday";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

// Groups timestamps by viewer-local calendar day.
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
