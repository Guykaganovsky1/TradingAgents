import { ThemeOrbs } from "@/components/theme-orbs";
import { Sidebar } from "@/components/sidebar";
import { BottomNav } from "@/components/bottom-nav";
import type { ReactNode } from "react";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative min-h-screen"
      style={{
        background:
          "linear-gradient(135deg, #0d0820 0%, #080e1f 45%, #071a10 100%)",
      }}
    >
      {/* Background orbs */}
      <ThemeOrbs />

      {/* App shell */}
      <div className="relative z-10 flex min-h-screen">
        {/* Sidebar (lg+) */}
        <Sidebar />

        {/* Main content */}
        <main
          id="main-content"
          className="flex-1 overflow-y-auto px-4 py-6 md:px-6 lg:px-7 pb-20 lg:pb-6"
          style={{ maxWidth: "100%", contain: "paint" }}
        >
          {children}
        </main>
      </div>

      {/* Bottom nav (< lg) */}
      <BottomNav />
    </div>
  );
}
