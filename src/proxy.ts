import { NextResponse, type NextRequest } from "next/server";

const protectedPrefixes = ["/admin", "/users"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = protectedPrefixes.some((prefix) => pathname.startsWith(prefix));
  if (!isProtected) return NextResponse.next();

  const token = request.cookies.get("investment_admin_session")?.value;
  if (token) return NextResponse.next();

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/users/:path*"]
};
