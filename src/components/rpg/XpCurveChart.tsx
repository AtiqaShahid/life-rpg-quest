import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceDot,
  CartesianGrid,
} from "recharts";
import { xpToNext } from "@/lib/progression";
import { TrendingUp } from "lucide-react";

type Props = { currentLevel: number; maxLevel?: number };

/** Visual XP progression curve — Level vs XP-to-next using 100 * level^1.5. */
export const XpCurveChart = ({ currentLevel, maxLevel = 20 }: Props) => {
  const data = useMemo(
    () =>
      Array.from({ length: maxLevel }, (_, i) => {
        const lvl = i + 1;
        return { level: lvl, xp: xpToNext(lvl) };
      }),
    [maxLevel],
  );

  const currentPoint = data.find((d) => d.level === currentLevel) ?? data[0];

  return (
    <div className="glass-strong rounded-3xl p-5 sm:p-6">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-secondary">
            <TrendingUp className="h-3.5 w-3.5" /> PROGRESSION CURVE
          </div>
          <h2 className="mt-1 font-display text-lg font-semibold">XP required per level</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Formula: <span className="font-mono">100 × level^1.5</span> · scaling difficulty
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] tracking-widest text-muted-foreground">YOU</div>
          <div className="font-display text-xl font-bold text-primary">LV {currentLevel}</div>
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="xpStroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="hsl(var(--primary))" />
                <stop offset="100%" stopColor="hsl(var(--accent))" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="level"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "hsl(var(--border))" }}
              label={{ value: "Level", position: "insideBottom", offset: -2, fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            />
            <YAxis
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "hsl(var(--border))" }}
              width={48}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 12,
                color: "hsl(var(--foreground))",
                fontSize: 12,
              }}
              labelFormatter={(l) => `Level ${l}`}
              formatter={(value: number) => [`${value.toLocaleString()} XP`, "Required"]}
            />
            <Line
              type="monotone"
              dataKey="xp"
              stroke="url(#xpStroke)"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "hsl(var(--primary))", strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "hsl(var(--accent))" }}
            />
            <ReferenceDot
              x={currentPoint.level}
              y={currentPoint.xp}
              r={7}
              fill="hsl(var(--accent))"
              stroke="hsl(var(--background))"
              strokeWidth={3}
              isFront
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};