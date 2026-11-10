import Link from "next/link";

/** Footer for the public pages: product links and the legal pages. */
export function SiteFooter({ entity }: { entity?: string }) {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center">
        <span>
          © {new Date().getFullYear()} {entity && !entity.startsWith("[") ? entity : "App Builder"}
        </span>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 sm:ml-auto">
          <Link href="/check" className="hover:text-foreground">
            App Store check
          </Link>
          <Link href="/pricing" className="hover:text-foreground">
            Pricing
          </Link>
          <Link href="/community" className="hover:text-foreground">
            Community
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
