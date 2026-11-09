"use client";

import { useRouter } from "next/navigation";
import { PromptBox } from "@/components/prompt-box";
import { ProjectCard, type ProjectCardData } from "@/components/project-card";

export function Landing({ community }: { community: ProjectCardData[] }) {
  const router = useRouter();
  return (
    <main>
      <section className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 pb-16 pt-20 text-center">
        <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
          Expo · React Native · iOS & Android
        </span>
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Describe an app. Get a real mobile app.
        </h1>
        <p className="max-w-xl text-balance text-lg text-muted-foreground">
          An AI agent plans the screens, writes the code, and gives you a live preview you can edit
          by chat or by clicking. Open it on your phone, export the source, or publish it.
        </p>
        <div className="w-full text-left">
          <PromptBox
            onSubmit={({ prompt }) => router.push(`/sign-up?prompt=${encodeURIComponent(prompt)}`)}
          />
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 pb-24" id="community">
        <h2 className="mb-4 text-lg font-semibold">Built with App Builder</h2>
        {community.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Public apps from the community will show up here.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {community.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
