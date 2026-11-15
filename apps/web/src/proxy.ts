import { NextResponse, type NextRequest } from "next/server";
import { INVITE_COOKIE } from "@/lib/invite-cookie";

/**
 * Factory mode (FACTORY_MODE=1, see factoryMode() in @appbuilder/core) turns the product's
 * selling parts off: pricing, checkout and the marketing funnel answer 404 (pages go home). It
 * also remembers the invite link a newcomer opened, since only invited people may sign up.
 * Outside factory mode this changes nothing.
 */
export function proxy(request: NextRequest) {
  if ((process.env.FACTORY_MODE || "") !== "1") return NextResponse.next();
  const { pathname } = request.nextUrl;
  const invite = /^\/invite\/([^/]+)$/.exec(pathname);
  if (invite) {
    const response = NextResponse.next();
    response.cookies.set(INVITE_COOKIE, invite[1]!, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });
    return response;
  }
  if (pathname.startsWith("/api/"))
    return NextResponse.json({ error: "Not available in this App Builder." }, { status: 404 });
  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: [
    "/invite/:token",
    "/pricing",
    "/check/:path*",
    "/unsubscribe",
    "/api/billing/:path*",
    "/api/leads/:path*",
  ],
};
