import Link from "next/link";

import type { Role } from "@/lib/permissions";
import { hasPermission } from "@/lib/permissions";

type EngineerHomeProps = {
  role: Role;
};

export function EngineerHome({ role }: EngineerHomeProps) {
  return (
    <section>
      <p className="notice">Choose a task below.</p>
      <div className="home-actions">
        {hasPermission(role, "customParts") && (
          <Link href="/custom-part" className="primary-button link-as-button">
            Add custom part
          </Link>
        )}
        {hasPermission(role, "editParts") && (
          <Link href="/parts/edit" className="secondary-button link-as-button">
            Edit stock part
          </Link>
        )}
      </div>
    </section>
  );
}
