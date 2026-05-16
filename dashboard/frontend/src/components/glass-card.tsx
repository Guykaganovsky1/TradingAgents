import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  variant?: "default" | "accent" | "green" | "red" | "amber";
  as?: "div" | "article" | "section";
}

const variants: Record<string, string> = {
  default:
    "bg-white/[0.03] border border-white/[0.07]",
  accent:
    "bg-indigo-500/[0.06] border border-indigo-400/25",
  green:
    "bg-emerald-500/[0.04] border border-emerald-400/20",
  red:
    "bg-red-500/[0.04] border border-red-400/20",
  amber:
    "bg-amber-500/[0.04] border border-amber-400/20",
};

export function GlassCard({
  children,
  className,
  variant = "default",
  as: Tag = "div",
}: GlassCardProps) {
  return (
    <Tag
      className={cn(
        "backdrop-blur-[10px] rounded-[14px] p-4",
        variants[variant],
        className
      )}
    >
      {children}
    </Tag>
  );
}
