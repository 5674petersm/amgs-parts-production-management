import type { DefaultSession } from "next-auth";

import type { Role } from "@/lib/permissions";

declare module "next-auth" {
  interface Session {
    user: {
      email: string;
      role: Role;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    email?: string;
    role?: Role;
  }
}
