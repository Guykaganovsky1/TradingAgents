"use client";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/[0.08] border border-red-400/20">
        <AlertTriangle size={24} className="text-red-400" aria-hidden="true" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-slate-200">Something went wrong</h2>
        <p className="mt-1 text-xs text-slate-500 max-w-sm">
          {error.message || "An unexpected error occurred."}
        </p>
        {error.digest && (
          <p className="mt-1 text-[11px] text-slate-600">
            Error ID: {error.digest}
          </p>
        )}
      </div>
      <button
        onClick={reset}
        className="rounded-[10px] px-5 py-2.5 text-sm font-semibold text-white"
        style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
      >
        Try again
      </button>
    </div>
  );
}
