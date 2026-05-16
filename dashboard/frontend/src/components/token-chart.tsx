"use client";
import dynamic from "next/dynamic";
import type { TokenDay } from "@/lib/types";
import { colors } from "@/lib/theme";

const BarChart = dynamic(
  () => import("recharts").then((m) => m.BarChart),
  { ssr: false }
);
const Bar = dynamic(() => import("recharts").then((m) => m.Bar), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const ResponsiveContainer = dynamic(
  () => import("recharts").then((m) => m.ResponsiveContainer),
  { ssr: false }
);
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });

interface TokenChartProps {
  data: TokenDay[];
}

function formatDayLabel(date: string): string {
  try {
    return new Date(date).toLocaleDateString("en", { weekday: "short" }).charAt(0);
  } catch {
    return date.slice(-2);
  }
}

export function TokenChart({ data }: TokenChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    label: formatDayLabel(d.date),
  }));

  return (
    <div className="h-16 w-full" aria-label="Token usage chart (7 days)">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
          barSize={8}
        >
          <XAxis
            dataKey="label"
            tick={{ fill: colors.textGhost, fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <YAxis hide />
          <Tooltip
            contentStyle={{
              background: colors.bgGradientStart,
              border: `1px solid ${colors.glassBorder}`,
              borderRadius: 8,
              fontSize: 11,
              color: colors.textSecondary,
            }}
            cursor={{ fill: colors.glassBg }}
            formatter={(value) =>
              typeof value === "number"
                ? new Intl.NumberFormat("en", { notation: "compact" }).format(value)
                : String(value)
            }
            labelStyle={{ color: colors.textMuted }}
          />
          <Bar
            dataKey="tokens_in"
            stackId="t"
            fill={colors.accentIndigoDark}
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="tokens_out"
            stackId="t"
            fill={colors.accentIndigo}
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
