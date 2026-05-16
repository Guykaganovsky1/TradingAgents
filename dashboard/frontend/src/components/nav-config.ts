import {
  LayoutDashboard,
  Play,
  Zap,
  BookMarked,
  History,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Run Analysis", href: "/run", icon: Play },
  { label: "Scan", href: "/scan", icon: Zap },
  { label: "Watchlist", href: "/watchlist", icon: BookMarked },
  { label: "History", href: "/history", icon: History },
  { label: "Settings", href: "/settings", icon: Settings },
];
