import Image from "next/image";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { AMGS_LOGO_URL } from "@/constants/branding";
import { hasPermission } from "@/lib/permissions";

export async function Header() {
  const session = await auth();
  const role = session?.user?.role;

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
      <div className="user-block">
        <nav className="header-nav" aria-label="Main">
          <Link href="/">Scan</Link>
          {role && hasPermission(role, "customParts") && (
            <Link href="/custom-part">Custom parts</Link>
          )}
          {role && hasPermission(role, "editParts") && (
            <Link href="/parts/edit">Edit parts</Link>
          )}
        </nav>
        {session?.user?.email ? (
          <>
            <span className="user-email">{session.user.email}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button type="submit" className="link-button">
                Sign out
              </button>
            </form>
          </>
        ) : (
          <Link href="/login" className="link-button">
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
