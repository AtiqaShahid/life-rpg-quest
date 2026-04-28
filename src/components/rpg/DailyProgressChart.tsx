import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Area, AreaChart } from "recharts";
import { memo } from "react";

type Bucket = { hour: number; label: string; xp: number; count: number; cumXp: number };

function DailyProgressChartImpl({ data }: { data: Bucket[] }) {
  return (
    <div className="h-44 sm:h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="xpGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.6} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={32} />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "hsl(var(--foreground))" }}
          />
          <Area type="monotone" dataKey="cumXp" name="Cumulative XP" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#xpGradient)" />
          <Line type="monotone" dataKey="xp" name="Hourly XP" stroke="hsl(var(--secondary))" strokeWidth={2} dot={{ r: 3 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const DailyProgressChart = memo(DailyProgressChartImpl);
export default DailyProgressChart;