"use client";
import { useEffect, useRef } from "react";

/**
 * Three blurred radial-gradient orbs as fixed background.
 * Subtle parallax on scroll — disabled if prefers-reduced-motion.
 */
export function ThemeOrbs() {
  const orbsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const handleScroll = () => {
      const y = window.scrollY;
      const el = orbsRef.current;
      if (!el) return;
      const orbs = el.querySelectorAll<HTMLElement>("[data-orb]");
      orbs.forEach((orb, i) => {
        const factor = 0.03 + i * 0.01;
        orb.style.transform = `translateY(${y * factor}px)`;
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div
      ref={orbsRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {/* Orb 1: indigo — top right */}
      <div
        data-orb="1"
        className="absolute rounded-full"
        style={{
          width: 400,
          height: 400,
          top: -100,
          right: 100,
          background:
            "radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)",
          filter: "blur(60px)",
          willChange: "transform",
        }}
      />
      {/* Orb 2: emerald — bottom left */}
      <div
        data-orb="2"
        className="absolute rounded-full"
        style={{
          width: 300,
          height: 300,
          bottom: 50,
          left: 150,
          background:
            "radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 70%)",
          filter: "blur(60px)",
          willChange: "transform",
        }}
      />
      {/* Orb 3: violet — center left */}
      <div
        data-orb="3"
        className="absolute rounded-full"
        style={{
          width: 250,
          height: 250,
          top: 200,
          left: 250,
          background:
            "radial-gradient(circle, rgba(139,92,246,0.10) 0%, transparent 70%)",
          filter: "blur(60px)",
          willChange: "transform",
        }}
      />
    </div>
  );
}
