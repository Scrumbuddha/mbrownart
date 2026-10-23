import { NextResponse, type NextRequest } from "next/server";
import { MIN_SECRET_LENGTH, SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/studio/login") return NextResponse.next();

  const secret = process.env.SESSION_SECRET;
  const ok = secret && secret.length >= MIN_SECRET_LENGTH
    ? await verifySessionToken(secret, req.cookies.get(SESSION_COOKIE)?.value, new Date())
    : false;
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/studio/login", req.url));
}

export const config = { matcher: ["/studio/:path*", "/api/studio/:path*"] };
