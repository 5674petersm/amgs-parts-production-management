import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

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
      const isPublic =
        pathname.startsWith("/login") || pathname.startsWith("/api/auth");

      if (isPublic) {
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
      if (session.user && token.email) {
        session.user.email = token.email;
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        token.email = user.email;
      }
      return token;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;
