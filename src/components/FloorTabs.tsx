"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Scan" },
  { href: "/orders", label: "Production Log" },
  { href: "/parts-demand", label: "Part Demand" },
  { href: "/custom-parts", label: "Custom Parts" },
];

export function FloorTabs() {
  const pathname = usePathname();
  return (
    <nav className="floor-tabs" aria-label="Production tools">
      {TABS.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link className={active ? "active" : ""} href={tab.href} key={tab.href}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
