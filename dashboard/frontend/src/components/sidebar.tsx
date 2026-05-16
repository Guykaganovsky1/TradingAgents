"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-config";
import { gradients } from "@/lib/theme";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      aria-label="Main navigation"
      className="hidden lg:flex flex-col gap-1.5 w-[200px] shrink-0 bg-white/[0.025] border-r border-white/[0.06] px-3 py-5 relative z-10"
    >
      {/* Logo */}
      <div className="px-2 mb-4">
        <span
          className="text-sm font-extrabold tracking-wide"
          style={{
            background: gradients.logo,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          TradingAgents
        </span>
      </div>

      {/* Section: Main — Overview, Run Analysis, Scan */}
      <p className="px-2 mb-1 text-[9px] uppercase tracking-[1.5px] text-white/20">
        Main
      </p>
      {NAV_ITEMS.slice(0, 3).map((item) => (
        <NavLink key={item.href} item={item} pathname={pathname} />
      ))}

      {/* Section: Portfolio — Watchlist, History */}
      <p className="px-2 mb-1 mt-3 text-[9px] uppercase tracking-[1.5px] text-white/20">
        Portfolio
      </p>
      {NAV_ITEMS.slice(3, 5).map((item) => (
        <NavLink key={item.href} item={item} pathname={pathname} />
      ))}

      {/* Section: System — Settings */}
      <p className="px-2 mb-1 mt-3 text-[9px] uppercase tracking-[1.5px] text-white/20">
        System
      </p>
      {NAV_ITEMS.slice(5).map((item) => (
        <NavLink key={item.href} item={item} pathname={pathname} />
      ))}
    </aside>
  );
}

function NavLink({
  item,
  pathname,
}: {
  item: (typeof NAV_ITEMS)[0];
  pathname: string;
}) {
  const isActive = pathname === item.href;
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
        isActive
          ? "bg-indigo-500/12 text-indigo-200 border border-indigo-500/20"
          : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-400"
      )}
    >
      <Icon size={14} aria-hidden="true" className="opacity-80 shrink-0" />
      {item.label}
    </Link>
  );
}
