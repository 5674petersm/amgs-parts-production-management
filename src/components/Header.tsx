import Image from "next/image";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { AMGS_LOGO_URL } from "@/constants/branding";
import { hasPermission } from "@/lib/permissions";

export async function Header() {
  const session = await auth();
  const role = session?.user?.role ?? "operator";

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
          <nav className="header-nav" aria-label="Main">
            {hasPermission(role, "production") && (
              <Link href="/">Scan</Link>
            )}
            {hasPermission(role, "customParts") && (
              <Link href="/custom-part">Custom parts</Link>
            )}
            {hasPermission(role, "editParts") && (
              <Link href="/parts/edit">Edit parts</Link>
            )}
          </nav>
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
