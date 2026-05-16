import Link from "next/link";
import { LayoutDashboard } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#070711] px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.07]">
        <LayoutDashboard size={28} className="text-indigo-400/70" aria-hidden="true" />
      </div>
      <div>
        <h1 className="text-3xl font-extrabold text-slate-100">404</h1>
        <p className="mt-1 text-sm text-slate-500">Page not found</p>
      </div>
      <Link
        href="/"
        className="rounded-[10px] px-5 py-2.5 text-sm font-semibold text-white"
        style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
      >
        Back to Overview
      </Link>
    </div>
  );
}
