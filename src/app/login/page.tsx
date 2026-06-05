import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";

type LoginPageProps = {
  searchParams: Promise<{ callbackUrl?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  const { callbackUrl } = await searchParams;

  return (
    <section className="card login-card">
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
      <p className="hint">
        <Link href="/">Back to home</Link>
      </p>
    </section>
  );
}
