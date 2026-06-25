import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";
import { AMGS_LOGO_URL } from "@/constants/branding";
import { defaultPathForRole } from "@/lib/permissions";

type LoginPageProps = {
  searchParams: Promise<{ callbackUrl?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await auth();
  if (session?.user?.role) {
    redirect(defaultPathForRole(session.user.role));
  }

  const { callbackUrl } = await searchParams;

  return (
    <section className="card login-card">
      <Image
        src={AMGS_LOGO_URL}
        alt="AMGS Advanced Machine Guarding Solutions"
        width={160}
        height={160}
        className="login-logo"
        priority
        unoptimized
      />
      <h2>Sign in</h2>
      <p>Use your company Google Workspace account.</p>
      <form
        action={async () => {
          "use server";
          await signIn("google", {
            redirectTo: callbackUrl || "/",
          });
        }}
      >
        <button type="submit" className="primary-button">
          Continue with Google
        </button>
      </form>
    </section>
  );
}
