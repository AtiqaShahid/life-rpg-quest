import { Brain, Flame, Activity as ActivityIcon, Clock, AlertTriangle, Sparkles, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useBehaviorProfile, formatHour, type BehaviorStatus } from "@/hooks/useBehaviorProfile";
import { cn } from "@/lib/utils";

type Props = { refreshKey?: number | string };

const STATUS_META: Record<BehaviorStatus, { label: string; tint: string; ring: string }> = {
  normal:   { label: "Normal",   tint: "text-emerald-300", ring: "ring-emerald-400/30" },
  warning:  { label: "Warning",  tint: "text-amber-300",   ring: "ring-amber-400/30" },
  burnout:  { label: "Burnout",  tint: "text-rose-300",    ring: "ring-rose-400/30" },
  inactive: { label: "Inactive", tint: "text-sky-300",     ring: "ring-sky-400/30" },
};

const TONE_DOT: Record<string, string> = {
  encourage: "bg-emerald-400",
  warn:      "bg-amber-400",
  celebrate: "bg-violet-400",
  rest:      "bg-rose-400",
  wakeup:    "bg-sky-400",
};

export const BehaviorInsightsPanel = ({ refreshKey }: Props) => {
  const { profile, feedback, loading, feedbackLoading } = useBehaviorProfile(refreshKey);

  if (loading && !profile) {
    return (
      <section className="glass-strong rounded-3xl p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Analyzing behavior…
        </div>
      </section>
    );
  }
  if (!profile) return null;

  const status = STATUS_META[profile.status];
  const burnPct = Math.round(profile.burnout_score);
  const consPct = Math.round(profile.consistency_score);
  const peak = profile.peak_hours[0];

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-secondary">
            <Brain className="h-3.5 w-3.5" /> BEHAVIOR INTELLIGENCE
          </div>
          <h2 className="mt-1 font-display text-lg font-semibold">Insights</h2>
        </div>
        <span className={cn("rounded-full px-2.5 py-1 font-mono text-[10px] tracking-widest ring-1", status.tint, status.ring)}>
          {status.label.toUpperCase()}
        </span>
      </div>

      {/* AI feedback message */}
      <div className="glass-strong rounded-3xl p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/30">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 font-mono text-[10px] tracking-widest text-muted-foreground">
              AI COACH
              {feedback?.tone && <span className={cn("h-1.5 w-1.5 rounded-full", TONE_DOT[feedback.tone] ?? "bg-primary")} />}
            </div>
            <p className="mt-1 font-display text-base text-foreground">
              {feedbackLoading && !feedback ? (
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading your patterns…
                </span>
              ) : feedback?.message ?? "Log a few activities so I can read your patterns."}
            </p>
            {feedback?.next_action && (
              <p className="mt-2 text-sm text-muted-foreground">
                <span className="font-mono text-[10px] tracking-widest text-secondary">NEXT </span>
                {feedback.next_action}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Meters + peaks */}
      <div className="grid gap-3 sm:grid-cols-3">
        {/* Consistency */}
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between font-mono text-[10px] tracking-widest text-muted-foreground">
            <span className="flex items-center gap-1.5"><ActivityIcon className="h-3 w-3" /> CONSISTENCY</span>
            <span className="text-foreground">{consPct}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full xp-bar-fill transition-all" style={{ width: `${consPct}%` }} />
          </div>
          <div className="mt-1.5 text-[11px] text-muted-foreground">{profile.signals.active_days_last_14}/14 active days</div>
        </div>

        {/* Burnout meter */}
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between font-mono text-[10px] tracking-widest text-muted-foreground">
            <span className="flex items-center gap-1.5"><AlertTriangle className="h-3 w-3" /> BURNOUT</span>
            <span className={cn(
              burnPct >= 65 ? "text-rose-300" : burnPct >= 40 ? "text-amber-300" : "text-foreground",
            )}>{burnPct}/100</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                burnPct >= 65 ? "bg-rose-400" : burnPct >= 40 ? "bg-amber-400" : "bg-emerald-400",
              )}
              style={{ width: `${burnPct}%` }}
            />
          </div>
          <div className="mt-1.5 text-[11px] text-muted-foreground">
            decline {profile.signals.performance_decline_pct}% · hard {profile.signals.hard_task_share}%
          </div>
        </div>

        {/* Peak window */}
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between font-mono text-[10px] tracking-widest text-muted-foreground">
            <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> PEAK WINDOW</span>
          </div>
          <div className="mt-1 font-display text-xl font-bold text-foreground">
            {peak ? formatHour(peak.hour) : "—"}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {peak ? `avg +${peak.avg_xp} XP · ${peak.count} sessions` : "Not enough data yet"}
          </div>
        </div>
      </div>

      {/* Per-activity trends */}
      {profile.activity_insights.length > 0 && (
        <div className="glass rounded-2xl p-4">
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] tracking-widest text-muted-foreground">
            <Flame className="h-3 w-3" /> ACTIVITY TRENDS
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {profile.activity_insights.slice(0, 4).map((i) => {
              const Icon = i.trend === "improving" ? TrendingUp : i.trend === "declining" ? TrendingDown : Minus;
              const tint =
                i.trend === "improving" ? "text-emerald-300" :
                i.trend === "declining" ? "text-rose-300" : "text-muted-foreground";
              return (
                <div key={i.type_id} className="flex items-center justify-between rounded-xl bg-muted/30 px-3 py-2 ring-1 ring-border">
                  <div className="min-w-0">
                    <div className="truncate font-display text-sm capitalize">{i.type_id.replace(/_/g, " ")}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      recent {i.avg_recent} · prev {i.avg_prev}
                    </div>
                  </div>
                  <div className={cn("flex items-center gap-1 font-mono text-[11px]", tint)}>
                    <Icon className="h-3.5 w-3.5" />
                    {i.trend}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};