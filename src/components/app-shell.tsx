"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/format";

const LINKS = [
  ["/", "Home"],
  ["/practice", "Practice"],
  ["/tests", "Tests"],
  ["/analytics", "My Analytics"],
  ["/syllabus", "Syllabus"],
  ["/history", "History"],
  ["/tutor", "AI Tutor"],
  ["/settings", "Settings"],
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/exam")) return <>{children}</>;
  return (
    <div className="min-h-screen min-w-0">
      <header className="sticky top-0 z-30 min-w-0 border-b-[3px] border-[var(--ink)] bg-[#fffaf3]/95 backdrop-blur">
        <div className="mx-auto flex min-w-0 max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center border-[3px] border-[var(--ink)] bg-[var(--vermilion)] font-display text-lg text-white">FJ</span>
            <span>
              <span className="block font-display text-2xl leading-none">FJEE</span>
              <span className="font-note text-sm text-[var(--muted)]">Vol. 01 · Ink & Integers</span>
            </span>
          </Link>
          <p className="hidden font-note text-lg text-[var(--indigo)] md:block">Start. Practice. Analyze. Improve. Master.</p>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-3">
          {LINKS.map(([href, label]) => {
            const path = href.trim();
            const active = path === "/" ? pathname === "/" : pathname.startsWith(path);
            return (
              <Link
                key={path}
                href={path}
                className={cx(
                  "min-h-11 shrink-0 border-2 border-[var(--ink)] px-3 py-1.5 text-sm font-semibold",
                  active ? "bg-[var(--ink)] text-white" : "bg-white text-[var(--ink)] hover:bg-[#f6efe4]",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="min-w-0">{children}</main>
    </div>
  );
}
