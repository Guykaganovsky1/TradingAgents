import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body: string;
  cta?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  cta,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 py-16 px-8 text-center",
        className
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.07]">
        <Icon
          size={26}
          className="text-indigo-400/70"
          aria-hidden="true"
        />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        <p className="text-xs text-slate-500 max-w-xs">{body}</p>
      </div>
      {cta && <div>{cta}</div>}
    </div>
  );
}
