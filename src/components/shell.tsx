import { ViewTransition } from "react";

type SlotProps = {
  children: React.ReactNode;
  className?: string;
};

export function Shell({ children, className }: SlotProps) {
  return (
    <main className={`flex h-full min-h-0 flex-col ${className ?? ""}`}>
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
}: SlotProps & { ref?: React.Ref<HTMLElement> }) {
  return (
    <ViewTransition name="app-body">
      <section
        ref={ref}
        className={`min-h-0 flex-1 overflow-y-auto ${className ?? ""}`}
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
