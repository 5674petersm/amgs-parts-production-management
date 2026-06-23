export type Role = "admin" | "engineer" | "operator";

export type Permission = "production" | "customParts" | "editParts";

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: ["production", "customParts", "editParts"],
  engineer: ["customParts", "editParts"],
  operator: ["production"],
};

function parseEmailList(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }
  return value
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function getEngineeringEmails(): string[] {
  return parseEmailList(process.env.AUTH_ENGINEER_EMAILS);
}

export function roleForEmail(email: string): Role {
  const normalized = email.trim().toLowerCase();
  const admins = parseEmailList(process.env.AUTH_ADMIN_EMAILS);
  const engineers = parseEmailList(process.env.AUTH_ENGINEER_EMAILS);

  if (admins.includes(normalized)) {
    return "admin";
  }
  if (engineers.includes(normalized)) {
    return "engineer";
  }
  return "operator";
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function hasAnyPermission(
  role: Role,
  permissions: readonly Permission[],
): boolean {
  return permissions.some((permission) => hasPermission(role, permission));
}

export function defaultPathForRole(role: Role): string {
  if (hasPermission(role, "production")) {
    return "/";
  }
  if (hasPermission(role, "customParts")) {
    return "/custom-part";
  }
  if (hasPermission(role, "editParts")) {
    return "/parts/edit";
  }
  return "/";
}

export function canAccessPath(pathname: string, role: Role): boolean {
  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth")) {
    return true;
  }

  if (pathname === "/" || pathname.startsWith("/search") || pathname.startsWith("/p/")) {
    return hasPermission(role, "production");
  }

  if (pathname.startsWith("/custom-part")) {
    return hasPermission(role, "customParts");
  }

  if (pathname.startsWith("/parts/edit")) {
    return hasPermission(role, "editParts");
  }

  return true;
}
