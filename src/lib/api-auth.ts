import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { auth } from "@/auth";
import {
  hasAnyPermission,
  hasPermission,
  PRODUCTION_ANONYMOUS_USER,
  type Permission,
  type Role,
} from "@/lib/permissions";

type AuthSuccess = {
  email: string;
  role: Role;
};

type AuthFailure = {
  response: NextResponse;
};

export async function optionalAuthEmail(
  fallback = PRODUCTION_ANONYMOUS_USER,
): Promise<string> {
  const session = await auth();
  return session?.user?.email ?? fallback;
}

export async function requireAuth(): Promise<AuthSuccess | AuthFailure> {
  const session = await auth();
  const email = session?.user?.email;
  const role = session?.user?.role;

  if (!email || !role) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { email, role };
}

export async function requireAuthOrShopFloor(request: Request): Promise<AuthSuccess | AuthFailure> {
  const expectedToken = process.env.SHOP_FLOOR_API_TOKEN?.trim() || "";
  const suppliedToken = request.headers.get("x-shop-floor-token") || "";
  if (expectedToken && suppliedToken) {
    const expected = Buffer.from(expectedToken);
    const supplied = Buffer.from(suppliedToken);
    if (expected.length === supplied.length && timingSafeEqual(expected, supplied)) {
      return { email: "dashboard-integration", role: "admin" };
    }
  }
  return requireAuth();
}

export async function requirePermission(
  permission: Permission,
): Promise<AuthSuccess | AuthFailure> {
  const result = await requireAuth();
  if ("response" in result) {
    return result;
  }

  if (!hasPermission(result.role, permission)) {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return result;
}

export async function requireAnyPermission(
  permissions: readonly Permission[],
): Promise<AuthSuccess | AuthFailure> {
  const result = await requireAuth();
  if ("response" in result) {
    return result;
  }

  if (!hasAnyPermission(result.role, permissions)) {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return result;
}
