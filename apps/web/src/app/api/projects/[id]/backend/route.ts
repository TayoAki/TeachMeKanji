import { NextResponse } from "next/server";
import { setAppCloud } from "@/lib/app-cloud-switch";
import { readJson, requireProject, route } from "@/lib/server";
import { publicAppUrl } from "@/lib/template";

/** Turn App Cloud on or off: the app's data moves between the device and the platform. */
export const POST = route(
  async (request: Request, ctx: RouteContext<"/api/projects/[id]/backend">) => {
    const { id } = await ctx.params;
    const { project, viewer } = await requireProject(id, "manage");
    const { enabled } = await readJson<{ enabled: boolean }>(request);
    return NextResponse.json(
      await setAppCloud({
        project,
        userId: viewer!.id,
        enabled: Boolean(enabled),
        apiOrigin: publicAppUrl(request),
      }),
    );
  },
);
