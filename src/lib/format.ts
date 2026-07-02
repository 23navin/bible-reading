export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatChatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round(
    (startOfDay(now) - startOfDay(date)) / 86_400_000,
  );
  if (diffDays <= 0) {
    return date
      .toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
      .toLowerCase();
  }
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) {
    return date
      .toLocaleDateString(undefined, { weekday: "long" })
      .toLowerCase();
  }
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const y = String(date.getFullYear() % 100).padStart(2, "0");
  return `${m}/${d}/${y}`;
}
