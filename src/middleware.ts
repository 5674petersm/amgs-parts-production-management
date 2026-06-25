import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/auth.config";
import {
  canAccessPath,
  defaultPathForRole,
  isPublicPath,
  type Role,
} from "@/lib/permissions";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;
  const isAuthRoute =
    pathname.startsWith("/login") || pathname.startsWith("/api/auth");
  const isPublic = isPublicPath(pathname, req.method);

  if (!isLoggedIn && !isPublic) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set(
      "callbackUrl",
      req.nextUrl.pathname + req.nextUrl.search,
    );
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && pathname === "/login") {
    const role = (req.auth?.user?.role ?? "operator") as Role;
    return NextResponse.redirect(new URL(defaultPathForRole(role), req.nextUrl.origin));
  }

  if (isLoggedIn && !isAuthRoute && !isPublic) {
    const role = (req.auth?.user?.role ?? "operator") as Role;
    if (!canAccessPath(pathname, role)) {
      return NextResponse.redirect(
        new URL(defaultPathForRole(role), req.nextUrl.origin),
      );
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
