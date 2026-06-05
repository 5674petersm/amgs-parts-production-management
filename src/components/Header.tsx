import { auth, signOut } from "@/auth";

export async function Header() {
  const session = await auth();

  return (
    <header className="site-header">
      <div>
        <p className="eyebrow">AMGS Production</p>
        <h1>Parts recording</h1>
      </div>
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
