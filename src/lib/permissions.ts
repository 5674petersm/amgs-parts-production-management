export type Role = "admin" | "engineer" | "operator";

export type Permission = "production" | "customParts" | "editParts" | "dashboards";

/** Recorded on production log entries when no one is signed in. */
export const PRODUCTION_ANONYMOUS_USER = "floor";

/** Short label for tblitemhistory.HisText1 on production entries. */
export function productionHisText1Label(userEmail: string): string {
  if (!userEmail || userEmail === PRODUCTION_ANONYMOUS_USER) {
    return PRODUCTION_ANONYMOUS_USER;
  }

  const atIndex = userEmail.indexOf("@");
  const localPart = atIndex === -1 ? userEmail : userEmail.slice(0, atIndex);

  if (localPart.length <= 5) {
    return localPart;
  }

  return localPart.slice(0, 5);
}

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: ["production", "customParts", "editParts", "dashboards"],
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

export function getEngineeringNotifyEmails(): string[] {
  return parseEmailList(process.env.ENGINEERING_NOTIFY_EMAILS);
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
  if (hasPermission(role, "dashboards")) {
    return "/dashboard";
  }
  if (hasPermission(role, "customParts")) {
    return "/custom-part";
  }
  if (hasPermission(role, "editParts")) {
    return "/parts/edit";
  }
  return "/";
}

/** Pages and APIs that floor staff can use without signing in. */
export function isPublicPath(pathname: string, method = "GET"): boolean {
  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth")) {
    return true;
  }

  if (pathname === "/" || pathname.startsWith("/search") || pathname.startsWith("/p/")) {
    return true;
  }

  if (pathname === "/api/production") {
    return true;
  }

  if (pathname === "/api/parts/lookup") {
    return true;
  }

  if (pathname === "/api/custom-parts/orders" || pathname === "/api/custom-parts/parts") {
    return true;
  }

  if (pathname === "/api/custom-parts/production") {
    return true;
  }

  if (pathname.endsWith("/notify-engineering")) {
    return method === "POST";
  }

  const partApiMatch = pathname.match(/^\/api\/parts\/[^/]+$/);
  if (partApiMatch) {
    return method !== "PATCH";
  }

  return false;
}

export function canAccessPath(pathname: string, role: Role): boolean {
  if (isPublicPath(pathname)) {
    return true;
  }

  if (pathname.startsWith("/custom-part")) {
    return hasPermission(role, "customParts");
  }

  if (pathname.startsWith("/parts/edit")) {
    return hasPermission(role, "editParts");
  }

  if (pathname.startsWith("/dashboard") || pathname.startsWith("/api/dashboard")) {
    return hasPermission(role, "dashboards");
  }

  if (pathname.startsWith("/api/custom-parts")) {
    return hasPermission(role, "customParts");
  }

  const partApiMatch = pathname.match(/^\/api\/parts\/[^/]+$/);
  if (partApiMatch && pathname !== "/api/parts/lookup") {
    return hasPermission(role, "editParts");
  }

  return true;
}
