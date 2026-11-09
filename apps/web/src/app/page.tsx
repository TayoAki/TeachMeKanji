import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <p className="text-sm font-medium text-muted-foreground">Phase 0 · foundations</p>
      <h1 className="text-4xl font-semibold tracking-tight">App Builder</h1>
      <p className="text-lg text-muted-foreground">
        Describe a mobile app and get a working Expo app you can preview, edit and ship. The product
        UI arrives in Phase 1; this build contains the foundations and the Phase 0 spikes.
      </p>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/spikes/preview">Open the preview runtime spike</Link>
        </Button>
      </div>
    </main>
  );
}
