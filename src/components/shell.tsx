import { ViewTransition } from "react";

type SlotProps = {
  children: React.ReactNode;
  className?: string;
};

/* "viewport": fixed 100dvh shell, Body scrolls internally (home, chat).
   "document": shell grows with content so the page itself scrolls — iOS
   Safari then lets content slide under its translucent URL bar and tints
   the bar from the page instead of painting it black. */
type ShellFlow = "viewport" | "document";

export function Shell({
  children,
  className,
  flow = "viewport",
}: SlotProps & { flow?: ShellFlow }) {
  return (
    <main
      className={`flex flex-col ${
        flow === "document" ? "min-h-full" : "h-full min-h-0"
      } ${className ?? ""}`}
    >
      {children}
    </main>
  );
}

export function Header({ children, className }: SlotProps) {
  return (
    <ViewTransition name="app-header">
      <header className={`shrink-0 ${className ?? ""}`}>{children}</header>
    </ViewTransition>
  );
}

export function Body({
  children,
  className,
  ref,
  flow = "viewport",
}: SlotProps & { ref?: React.Ref<HTMLElement>; flow?: ShellFlow }) {
  return (
    <ViewTransition name="app-body">
      <section
        ref={ref}
        className={`flex-1 ${
          flow === "document" ? "" : "min-h-0 overflow-y-auto"
        } ${className ?? ""}`}
      >
        {children}
      </section>
    </ViewTransition>
  );
}

export function Footer({ children, className }: SlotProps) {
  return (
    <ViewTransition name="app-footer">
      <div className={`shrink-0 ${className ?? ""}`}>{children}</div>
    </ViewTransition>
  );
}
