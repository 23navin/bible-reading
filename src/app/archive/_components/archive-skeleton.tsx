export function ArchiveListSkeleton() {
  // Each entry mirrors a real card: play/"t" circle + text-sm reference +
  // text-xs timestamp, then 1-2 body lines at text-[15px] leading-snug,
  // and on some cards a share chip.
  const cards = [
    {
      reference: "w-32",
      lines: ["w-full", "w-full", "w-5/6", "w-full", "w-full", "w-2/3"],
    },
    { reference: "w-24", lines: ["w-3/4"]},
    {
      reference: "w-36",
      lines: ["w-full", "w-5/6", "w-full", "w-full", "w-1/2"],
    },
    { reference: "w-28", lines: ["w-full", "w-5/6"]},
    {
      reference: "w-32",
      lines: ["w-full", "w-full", "w-3/4", "w-full", "w-full", "w-5/6"],
    },
    { reference: "w-24", lines: ["w-2/3"]},
  ];
  return (
    <ul aria-hidden className="flex animate-pulse flex-col gap-3">
      {cards.map((card, i) => (
        <li key={i}>
          <div className="rounded-2xl bg-neutral-800 px-4 py-2.5">
            <div className="flex items-center gap-3">
              <span className="h-8 w-8 shrink-0 rounded-full bg-white/20" />
              <div className="flex flex-1 items-center justify-between gap-3">
                <span className={`my-[3px] h-3.5 rounded bg-neutral-600 ${card.reference}`} />
                <span className="my-0.5 h-3 w-24 shrink-0 rounded bg-neutral-700" />
              </div>
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              {card.lines.map((width, j) => (
                <span key={j} className={`h-3.5 rounded bg-neutral-700 ${width}`} />
              ))}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
