import Link from "next/link";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            AB
          </span>
          App Builder
        </Link>
        <nav className="hidden gap-5 text-sm text-muted-foreground sm:flex">
          <Link href="/community" className="hover:text-foreground">
            Community
          </Link>
          <Link href="/pricing" className="hover:text-foreground">
            Pricing
          </Link>
        </nav>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" asChild>
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/sign-up">Get started</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
