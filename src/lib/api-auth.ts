import { NextResponse } from "next/server";

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
