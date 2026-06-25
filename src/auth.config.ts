import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

import { isPublicPath, roleForEmail, type Role } from "@/lib/permissions";

const allowedDomain = process.env.AUTH_ALLOWED_DOMAIN?.toLowerCase().trim();

export const authConfig = {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          prompt: "select_account",
          ...(allowedDomain ? { hd: allowedDomain } : {}),
        },
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (isPublicPath(pathname, request.method)) {
        return true;
      }

      return !!auth?.user;
    },
    async signIn({ user, account }) {
      if (!allowedDomain) {
        return true;
      }

      const email = user.email?.toLowerCase() ?? "";
      const hostedDomain = (
        account as { hosted_domain?: string } | null
      )?.hosted_domain?.toLowerCase();

      if (hostedDomain === allowedDomain) {
        return true;
      }

      return email.endsWith(`@${allowedDomain}`);
    },
    async session({ session, token }) {
      if (session.user) {
        if (token.email) {
          session.user.email = token.email;
        }
        if (token.role) {
          session.user.role = token.role as Role;
        }
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        token.email = user.email;
      }
      if (token.email) {
        token.role = roleForEmail(token.email);
      }
      return token;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;
