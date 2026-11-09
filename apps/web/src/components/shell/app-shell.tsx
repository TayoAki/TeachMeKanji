import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { LeftRail, type RailUser } from "./left-rail";

/**
 * The product's layout, from the wireframe:
 *   left rail | sidebar | (tabs over main content) | right sidebar
 *   ───────────────────── bottom bar ─────────────────────────────
 */
export function AppShell({
  user,
  active,
  sidebar,
  tabs,
  children,
  aside,
  bottomLeft,
  bottomRight,
  asideWidth = "w-[360px]",
}: {
  user: RailUser;
  active?: "home" | "community" | "settings";
  sidebar?: ReactNode;
  tabs?: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
  bottomLeft?: ReactNode;
  bottomRight?: ReactNode;
  asideWidth?: string;
}) {
  return (
    <div className="grid h-dvh grid-cols-[auto_1fr] grid-rows-[1fr_auto] overflow-hidden bg-background">
      <LeftRail user={user} active={active} />
      <div className="flex min-h-0 min-w-0">
        {sidebar ? (
          <aside
            className="hidden w-72 shrink-0 flex-col border-r bg-muted/30 md:flex"
            data-testid="sidebar"
          >
            {sidebar}
          </aside>
        ) : null}
        <main className="flex min-w-0 flex-1 flex-col" data-testid="main">
          {tabs ? (
            <div className="flex h-11 shrink-0 items-center gap-2 border-b px-2">{tabs}</div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-auto">{children}</div>
        </main>
        {aside ? (
          <aside
            className={cn(
              "hidden shrink-0 flex-col overflow-y-auto border-l bg-muted/20 lg:flex",
              asideWidth,
            )}
            data-testid="right-sidebar"
          >
            {aside}
          </aside>
        ) : null}
      </div>
      <footer
        className="col-span-2 flex h-7 items-center justify-between gap-4 border-t bg-muted/40 px-3 text-[11px] text-muted-foreground"
        data-testid="bottom-bar"
      >
        <div className="flex min-w-0 items-center gap-3 truncate">{bottomLeft}</div>
        <div className="flex shrink-0 items-center gap-3">{bottomRight}</div>
      </footer>
    </div>
  );
}

export function SidebarHeader({ children }: { children: ReactNode }) {
  return <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">{children}</div>;
}

export function PanelSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-b p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
