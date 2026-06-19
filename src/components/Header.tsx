import Image from "next/image";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { AMGS_LOGO_URL } from "@/constants/branding";
export async function Header() {
  const session = await auth();

  return (
    <header className="site-header">
      <Link href="/" className="brand-lockup">
        <Image
          src={AMGS_LOGO_URL}
          alt="AMGS Advanced Machine Guarding Solutions"
          width={56}
          height={56}
          className="brand-logo"
          priority
          unoptimized
        />
        <p className="brand-title">Production Management System</p>
      </Link>
      {session?.user?.email && (
        <div className="user-block">
          <span className="user-email">{session.user.email}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit" className="link-button">
              Sign out
            </button>
          </form>
        </div>
      )}
    </header>
  );
}
