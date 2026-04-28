import { useMemo } from "react";
import { useLifeScore, type LifeScoreBreakdown, type AnalystReport } from "@/hooks/useLifeScore";
import { Loader2, Activity, AlertTriangle, TrendingUp, TrendingDown, Sparkles, Target, Brain, Gauge, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const WEIGHTS: Record<keyof LifeScoreBreakdown, number> = {
  discipline: 40, consistency: 25, completion: 20, energy: 15,
};
const LABELS: Record<keyof LifeScoreBreakdown, string> = {
  discipline: "Discipline", consistency: "Consistency", completion: "Completion", energy: "Energy",
};
const ICONS: Record<keyof LifeScoreBreakdown, React.ComponentType<{ className?: string }>> = {
  discipline: Target, consistency: Activity, completion: Sparkles, energy: Zap,
};

const RISK_TINT: Record<AnalystReport["risk_level"], { tint: string; ring: string; label: string }> = {
  stable:   { tint: "text-emerald-300", ring: "ring-emerald-400/30", label: "STABLE" },
  watch:    { tint: "text-amber-300",   ring: "ring-amber-400/30",   label: "WATCH" },
  decline:  { tint: "text-orange-300",  ring: "ring-orange-400/30",  label: "DECLINE" },
  burnout:  { tint: "text-rose-300",    ring: "ring-rose-400/30",    label: "BURNOUT RISK" },
  inactive: { tint: "text-sky-300",     ring: "ring-sky-400/30",     label: "INACTIVE" },
};

function scoreColor(n: number) {
  if (n >= 75) return "text-emerald-300";
  if (n >= 50) return "text-amber-300";
  if (n >= 25) return "text-orange-300";
  return "text-rose-300";
}
function barColor(n: number) {
  if (n >= 75) return "bg-emerald-400";
  if (n >= 50) return "bg-amber-400";
  if (n >= 25) return "bg-orange-400";
  return "bg-rose-400";
}

function CircularScore({ value }: { value: number }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, value)) / 100) * c;
  return (
    <div className="relative h-[180px] w-[180px]">
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        <circle cx="80" cy="80" r={r} stroke="hsl(var(--muted))" strokeWidth="14" fill="none" />
        <circle
          cx="80" cy="80" r={r}
          stroke="url(#lifeGrad)"
          strokeWidth="14" strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700"
        />
        <defs>
          <linearGradient id="lifeGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" />
            <stop offset="100%" stopColor="hsl(var(--secondary))" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className={cn("font-display text-5xl font-bold", scoreColor(value))}>{value}</div>
        <div className="font-mono text-[10px] tracking-widest text-muted-foreground">/ 100 LIFE SCORE</div>
      </div>
    </div>
  );
}

function Sparkline({ data }: { data: { date: string; xp: number }[] }) {
  const max = Math.max(1, ...data.map(d => d.xp));
  return (
    <div className="flex h-16 items-end gap-1">
      {data.map((d, i) => (
        <div
          key={i}
          title={`${d.date}: ${d.xp} XP`}
          className="flex-1 rounded-sm bg-gradient-to-t from-primary/70 to-secondary/70"
          style={{ height: `${Math.max(4, (d.xp / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

export default function Analytics() {
  const { snapshot, report, loading, reportLoading, refresh } = useLifeScore();

  const breakdown = useMemo(() => {
    if (!snapshot) return [] as { key: keyof LifeScoreBreakdown; value: number }[];
    return (Object.keys(snapshot.breakdown) as (keyof LifeScoreBreakdown)[]).map(k => ({
      key: k, value: Math.round(snapshot.breakdown[k]),
    }));
  }, [snapshot]);

  if (loading && !snapshot) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Computing your Life Score…
      </div>
    );
  }
  if (!snapshot) return null;

  const risk = report ? RISK_TINT[report.risk_level] : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-secondary">
            <Brain className="h-3.5 w-3.5" /> ANALYTICS · BEHAVIORAL INTELLIGENCE
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight neon-text-primary">Life Score</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">14-day rolling analysis of discipline, consistency, completion and energy.</p>
        </div>
        <button
          onClick={refresh}
          className="rounded-xl border border-border/60 bg-muted/30 px-3 py-1.5 font-mono text-[11px] tracking-widest text-muted-foreground transition hover:text-foreground"
        >
          RECOMPUTE
        </button>
      </header>

      {/* Score + AI summary */}
      <section className="glass-strong grid gap-6 rounded-3xl p-6 md:grid-cols-[auto,1fr]">
        <div className="flex justify-center md:justify-start">
          <CircularScore value={snapshot.life_score} />
        </div>
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {risk && (
              <span className={cn("rounded-full px-2.5 py-1 font-mono text-[10px] tracking-widest ring-1", risk.tint, risk.ring)}>
                {risk.label}
              </span>
            )}
            {report && (
              <span className="rounded-full bg-muted/40 px-2.5 py-1 font-mono text-[10px] tracking-widest text-muted-foreground ring-1 ring-border">
                FOCUS · {LABELS[report.focus_metric].toUpperCase()}
              </span>
            )}
          </div>
          <p className="font-display text-base text-foreground">
            {reportLoading && !report ? (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running behavioral analysis…
              </span>
            ) : report?.summary ?? "No analysis available yet."}
          </p>

          {/* 14-day XP sparkline */}
          <div>
            <div className="mb-1 flex items-center justify-between font-mono text-[10px] tracking-widest text-muted-foreground">
              <span>14-DAY ACTIVITY</span>
              <span>{snapshot.signals.acts_recent_7d} this wk · {snapshot.signals.acts_prev_7d} prev</span>
            </div>
            <Sparkline data={snapshot.daily_series_14d.map(d => ({ date: d.date, xp: d.xp }))} />
          </div>
        </div>
      </section>

      {/* Breakdown bar chart */}
      <section>
        <div className="mb-3 flex items-center gap-2 font-mono text-[11px] tracking-widest text-secondary">
          <Gauge className="h-3.5 w-3.5" /> COMPONENT BREAKDOWN
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {breakdown.map(({ key, value }) => {
            const Icon = ICONS[key];
            const isFocus = report?.focus_metric === key;
            return (
              <div key={key} className={cn("glass rounded-2xl p-4", isFocus && "ring-1 ring-primary/40")}>
                <div className="flex items-center justify-between font-mono text-[10px] tracking-widest text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Icon className="h-3 w-3" /> {LABELS[key].toUpperCase()} · {WEIGHTS[key]}%</span>
                  <span className={cn("text-sm font-semibold", scoreColor(value))}>{value}</span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full transition-all", barColor(value))} style={{ width: `${value}%` }} />
                </div>
                <div className="mt-1.5 text-[11px] text-muted-foreground">
                  {key === "discipline" && `${snapshot.signals.hard_activities_14d} hard · ${snapshot.signals.medium_activities_14d} med · ${snapshot.signals.easy_activities_14d} easy (14d)`}
                  {key === "consistency" && `${snapshot.signals.active_days_14d}/14 active days · max gap ${snapshot.signals.max_gap_days}d`}
                  {key === "completion" && `${snapshot.signals.quests_done_14d}/${snapshot.signals.quests_total_14d} quests · recent ${snapshot.signals.completion_recent_pct}% vs ${snapshot.signals.completion_prev_pct}% prior`}
                  {key === "energy" && `hour σ=${snapshot.signals.hour_stddev} · streak ${snapshot.signals.current_streak} (best ${snapshot.signals.longest_streak})`}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Trends */}
      <section>
        <div className="mb-3 flex items-center gap-2 font-mono text-[11px] tracking-widest text-secondary">
          {snapshot.signals.acts_recent_7d >= snapshot.signals.acts_prev_7d
            ? <TrendingUp className="h-3.5 w-3.5" />
            : <TrendingDown className="h-3.5 w-3.5" />}
          TREND ANALYSIS
        </div>
        <div className="space-y-2">
          {snapshot.trends.length === 0 ? (
            <div className="glass rounded-2xl p-4 text-sm text-muted-foreground">
              No notable trends in the last 14 days. Keep logging to surface signal.
            </div>
          ) : snapshot.trends.map((t, i) => (
            <div key={i} className="glass rounded-2xl p-4 text-sm">
              <span className="mr-2 font-mono text-[10px] tracking-widest text-secondary">SIGNAL {String(i + 1).padStart(2, "0")}</span>
              {t}
            </div>
          ))}
        </div>
      </section>

      {/* Predictions */}
      <section>
        <div className="mb-3 flex items-center gap-2 font-mono text-[11px] tracking-widest text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5" /> PREDICTIONS
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {(report?.predictions ?? snapshot.predictions).length === 0 ? (
            <div className="glass rounded-2xl p-4 text-sm text-muted-foreground sm:col-span-2">
              No high-confidence predictions yet — more data needed.
            </div>
          ) : (report?.predictions ?? snapshot.predictions).map((p, i) => (
            <div key={i} className="glass rounded-2xl border-l-2 border-amber-400/60 p-4 text-sm">
              {p}
            </div>
          ))}
        </div>
      </section>

      {/* Recommendations */}
      <section className="pb-2">
        <div className="mb-3 flex items-center gap-2 font-mono text-[11px] tracking-widest text-emerald-300">
          <Sparkles className="h-3.5 w-3.5" /> ADAPTIVE RECOMMENDATIONS
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {(report?.recommendations ?? snapshot.recommendations).length === 0 ? (
            <div className="glass rounded-2xl p-4 text-sm text-muted-foreground sm:col-span-2">
              Holding pattern — no adjustments recommended.
            </div>
          ) : (report?.recommendations ?? snapshot.recommendations).map((r, i) => (
            <div key={i} className="glass-strong rounded-2xl border-l-2 border-emerald-400/60 p-4 text-sm">
              <div className="font-mono text-[10px] tracking-widest text-emerald-300">ACTION {String(i + 1).padStart(2, "0")}</div>
              <div className="mt-1">{r}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}