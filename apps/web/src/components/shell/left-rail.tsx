"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  CircleCheck,
  CircleX,
  Home,
  LayoutGrid,
  MessageSquarePlus,
  Loader2,
  Moon,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { installClientErrorBuffer } from "@/lib/client-errors";
import { FeedbackDialog, openFeedback } from "@/components/feedback-dialog";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  setThemePreference,
  useResolvedTheme,
  useThemePreference,
  type ThemePreference,
} from "@/lib/theme";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TimeAgo } from "@/components/time-ago";

export interface RailUser {
  name: string;
  email: string;
  image: string | null;
}

const RUN_LABELS: Record<string, string> = {
  plan: "Planned",
  build: "Built",
  edit: "Edited",
  github_push: "Pushed to GitHub",
  native_build: "Native build",
  device_preview: "Device preview",
};

function RailButton({
  label,
  active,
  href,
  onClick,
  children,
  testId,
}: {
  label: string;
  active?: boolean;
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  const className = cn(
    "flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
    active && "bg-accent text-foreground",
  );
  const content = href ? (
    <Link href={href} aria-label={label} className={className} data-testid={testId}>
      {children}
    </Link>
  ) : (
    <button
      type="button"
      aria-label={label}
      className={className}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
    </button>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function ProjectSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState<Array<{ id: string; name: string; status: string }>>([]);
  useEffect(() => {
    if (open)
      api<{ projects: typeof projects }>("/api/projects", { quiet: true })
        .then((r) => setProjects(r.projects))
        .catch(() => {});
  }, [open]);
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search projects"
      description="Jump to a project"
    >
      {/* The input and list need the Command root: without it, opening the dialog crashes. */}
      <Command>
        <CommandInput placeholder="Search projects…" />
        <CommandList>
          <CommandEmpty>No projects found.</CommandEmpty>
          <CommandGroup heading="Projects">
            {projects.map((p) => (
              <CommandItem
                key={p.id}
                value={`${p.name} ${p.id}`}
                onSelect={() => {
                  onOpenChange(false);
                  router.push(`/projects/${p.id}`);
                }}
              >
                {p.name}
                <span className="ml-auto text-xs text-muted-foreground">
                  {p.status.replace("_", " ")}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

interface ActivityItem {
  id: string;
  kind: string;
  status: string;
  error: string | null;
  createdAt: string;
  projectId: string;
  projectName: string;
}

function ActivityPopover() {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  return (
    <Popover
      onOpenChange={(open) => {
        if (open)
          api<{ activity: ActivityItem[] }>("/api/activity", { quiet: true })
            .then((r) => setItems(r.activity))
            .catch(() => setItems([]));
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Activity"
              data-testid="rail-activity"
              className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Bell className="size-5" />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">Activity</TooltipContent>
      </Tooltip>
      <PopoverContent side="right" align="start" className="w-80 p-0">
        <div className="border-b px-4 py-3 text-sm font-medium">Activity</div>
        <ul className="max-h-96 overflow-auto py-1 text-sm" data-testid="activity-list">
          {items === null ? (
            <li className="px-4 py-3 text-muted-foreground">Loading…</li>
          ) : items.length === 0 ? (
            <li className="px-4 py-3 text-muted-foreground">Nothing yet.</li>
          ) : (
            items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/projects/${item.projectId}`}
                  className="flex items-start gap-3 px-4 py-2 hover:bg-accent"
                >
                  {item.status === "succeeded" ? (
                    <CircleCheck className="mt-0.5 size-4 text-emerald-600" />
                  ) : item.status === "failed" || item.status === "cancelled" ? (
                    <CircleX className="mt-0.5 size-4 text-destructive" />
                  ) : (
                    <Loader2 className="mt-0.5 size-4 animate-spin" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.projectName}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {RUN_LABELS[item.kind] ?? item.kind}
                      {item.status === "failed" ? ` · failed` : ""} ·{" "}
                      <TimeAgo date={item.createdAt} />
                    </span>
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function LeftRail({
  user,
  active,
}: {
  user: RailUser;
  active?: "home" | "community" | "settings";
}) {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);

  // Bug reports carry the builder's recent errors in this tab.
  useEffect(() => installClientErrorBuffer(), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <nav
      className="row-span-1 flex w-14 flex-col items-center gap-1 border-r bg-muted/40 py-2"
      data-testid="left-rail"
    >
      <Link
        href="/"
        className="mb-2 flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground"
        aria-label="App Builder"
      >
        AB
      </Link>
      <RailButton label="Home" href="/" active={active === "home"} testId="rail-home">
        <Home className="size-5" />
      </RailButton>
      <RailButton label="Search (⌘K)" onClick={() => setSearchOpen(true)} testId="rail-search">
        <Search className="size-5" />
      </RailButton>
      <ActivityPopover />
      <RailButton
        label="Community apps"
        href="/community"
        active={active === "community"}
        testId="rail-community"
      >
        <LayoutGrid className="size-5" />
      </RailButton>
      <RailButton
        label="Settings"
        href="/settings"
        active={active === "settings"}
        testId="rail-settings"
      >
        <Settings className="size-5" />
      </RailButton>
      <div className="mt-auto flex flex-col items-center gap-2">
        <RailButton
          label="Report a bug or request a feature"
          onClick={() => openFeedback()}
          testId="rail-feedback"
        >
          <MessageSquarePlus className="size-5" />
        </RailButton>
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Account"
              className="rounded-full"
              data-testid="rail-account"
            >
              <Avatar className="size-9">
                {user.image ? <AvatarImage src={user.image} alt="" /> : null}
                <AvatarFallback>{user.name.slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="truncate">{user.name}</div>
              <div className="truncate text-xs font-normal text-muted-foreground">{user.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push("/settings")}>
              Settings & credits
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push("/pricing")}>Plans</DropdownMenuItem>
            <ThemeMenu />
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => openFeedback({ kind: "bug" })}>
              Report a bug
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openFeedback({ kind: "request" })}>
              Request a feature
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={async () => {
                await authClient.signOut();
                router.push("/");
                router.refresh();
              }}
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ProjectSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <FeedbackDialog />
    </nav>
  );
}

function ThemeMenu() {
  const theme = useThemePreference();
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger data-testid="theme-menu">Appearance</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => setThemePreference(value as ThemePreference)}
        >
          <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/** One click between night and day for the builder (System is in the account menu). */
function ThemeToggle() {
  const shown = useResolvedTheme();
  const next = shown === "dark" ? "light" : "dark";
  return (
    <RailButton
      label={next === "light" ? "Switch to light mode" : "Switch to night mode"}
      onClick={() => setThemePreference(next)}
      testId="rail-theme"
    >
      {shown === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </RailButton>
  );
}
