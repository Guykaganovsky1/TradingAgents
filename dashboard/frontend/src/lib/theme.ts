// Single source of truth for all design tokens
// No hex literals in components — import from here

export const colors = {
  // Backgrounds
  bgGradientStart: "#0d0820",
  bgGradientMid: "#080e1f",
  bgGradientEnd: "#071a10",
  pageBg: "#070711",

  // Glass card
  glassBg: "rgba(255,255,255,0.03)",
  glassBorder: "rgba(255,255,255,0.07)",
  glassRadius: "14px",
  blurPx: 10,

  // Accents
  accentIndigo: "#6366f1",
  accentIndigoDark: "#4338ca",
  accentIndigoLight: "#818cf8",
  accentPurple: "#8b5cf6",
  accentEmerald: "#34d399",
  accentEmeraldDark: "#10b981",
  accentAmber: "#fbbf24",
  accentAmberDark: "#f59e0b",
  accentRed: "#f87171",
  accentRedDark: "#ef4444",
  accentTeal: "#10b981",

  // Text
  textPrimary: "#f1f5f9",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  textFaint: "#475569",
  textGhost: "#334155",

  // Signals
  buyBg: "rgba(52,211,153,0.12)",
  buyBorder: "rgba(52,211,153,0.3)",
  buyText: "#34d399",

  holdBg: "rgba(251,191,36,0.12)",
  holdBorder: "rgba(251,191,36,0.3)",
  holdText: "#fbbf24",

  sellBg: "rgba(239,68,68,0.12)",
  sellBorder: "rgba(239,68,68,0.3)",
  sellText: "#f87171",
} as const;

export const fonts = {
  sans: "Inter",
  mono: "JetBrains Mono",
} as const;

export const gradients = {
  logo: "linear-gradient(90deg, #818cf8, #34d399)",
  primaryButton: "linear-gradient(135deg, #6366f1, #8b5cf6)",
  bgBody: "linear-gradient(135deg, #0d0820 0%, #080e1f 45%, #071a10 100%)",
  tokenBar: "linear-gradient(180deg, #6366f1, #4338ca)",
} as const;

export const focusRing =
  "focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 focus-visible:outline-none";

export const glassCn =
  "bg-white/[0.03] border border-white/[0.07] backdrop-blur-[10px] rounded-[14px]";
