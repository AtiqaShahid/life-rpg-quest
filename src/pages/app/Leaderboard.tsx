import { useSocial, type LeaderboardScope } from "@/hooks/useSocial";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { Brain, Crown, Dumbbell, Flame, Globe, Medal, Shield, Sparkles, Trophy, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const TABS: Array<{ id: LeaderboardScope; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "weekly",     label: "Weekly",     icon: Trophy },
  { id: "friends",    label: "Friends",    icon: Users },
  { id: "global",     label: "All-time",   icon: Globe },
  { id: "study",      label: "Study",      icon: Brain },
  { id: "fitness",    label: "Fitness",    icon: Dumbbell },
  { id: "discipline", label: "Discipline", icon: Flame },
];

function valueFor(scope: LeaderboardScope, e: ReturnType<typeof useSocial>["leaderboard"][number]) {
  switch (scope) {
    case "weekly":     return `${e.weekly_xp} XP • ${e.weekly_quests} quests`;
    case "study":      return `${e.study_xp} XP`;
    case "fitness":    return `${e.fitness_xp} XP`;
    case "discipline": return `${e.discipline_score} day streak`;
    default:           return `${e.total_xp} XP`;
  }
}

/** Pick the metric used for ranking inside a scope. */
function metricFor(scope: LeaderboardScope, e: ReturnType<typeof useSocial>["leaderboard"][number]): number {
  switch (scope) {
    case "weekly":     return e.weekly_xp;
    case "study":      return e.study_xp;
    case "fitness":    return e.fitness_xp;
    case "discipline": return e.discipline_score;
    default:           return e.total_xp;
  }
}

type Tier = { id: "elite" | "advanced" | "active" | "participation"; label: string; icon: typeof Crown; color: string; ring: string };
const TIERS: Tier[] = [
  { id: "elite",         label: "Elite",         icon: Crown,  color: "text-yellow-300", ring: "ring-yellow-300/60" },
  { id: "advanced",      label: "Advanced",      icon: Medal,  color: "text-secondary",  ring: "ring-secondary/60"  },
  { id: "active",        label: "Active",        icon: Shield, color: "text-accent",     ring: "ring-accent/50"     },
  { id: "participation", label: "Participation", icon: Sparkles, color: "text-muted-foreground", ring: "ring-border" },
];
function tierFor(rank: number): Tier {
  if (rank <= 3)  return TIERS[0];
  if (rank <= 10) return TIERS[1];
  if (rank <= 20) return TIERS[2];
  return TIERS[3];
}

/** Returns ms until next Monday 00:00 UTC. */
function useWeeklyCountdown() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const target = useMemo(() => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    const day = d.getUTCDay(); // 0=Sun..6=Sat
    const daysUntilMon = ((8 - day) % 7) || 7;
    d.setUTCDate(d.getUTCDate() + daysUntilMon);
    return d.getTime();
  }, []);
  const ms = Math.max(0, target - now);
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  return { days, hours, mins };
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const s = useSocial();
  const countdown = useWeeklyCountdown();

  const myIndex = s.leaderboard.findIndex((e) => e.user_id === user?.id);
  const myEntry = myIndex >= 0 ? s.leaderboard[myIndex] : null;
  const myRank = myIndex >= 0 ? myIndex + 1 : null;
  const myValue = myEntry ? metricFor(s.scope, myEntry) : 0;
  const topValue = s.leaderboard.length ? metricFor(s.scope, s.leaderboard[0]) : 0;

  // Distance to next rank above me (for nudge text)
  const nextAhead = myIndex > 0 ? s.leaderboard[myIndex - 1] : null;
  const nextDelta = nextAhead && myEntry
    ? Math.max(0, metricFor(s.scope, nextAhead) - myValue + 1)
    : 0;
  // Distance to next tier
  const tierTargetRank = myRank == null ? null
    : myRank > 20 ? 20 : myRank > 10 ? 10 : myRank > 3 ? 3 : null;
  const tierTargetEntry = tierTargetRank ? s.leaderboard[tierTargetRank - 1] : null;
  const tierDelta = tierTargetEntry && myEntry
    ? Math.max(0, metricFor(s.scope, tierTargetEntry) - myValue + 1)
    : 0;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold neon-text-primary">Leaderboards</h1>
            <p className="text-sm text-muted-foreground">Only timer-validated quests count. No farming, no shortcuts.</p>
          </div>
          {s.scope === "weekly" && (
            <div className="glass rounded-xl px-3 py-2 text-right">
              <div className="font-mono text-[10px] uppercase tracking-widest text-secondary">Week resets in</div>
              <div className="font-display text-sm font-semibold">
                {countdown.days}d {countdown.hours}h {countdown.mins}m
              </div>
            </div>
          )}
        </div>

        {/* Tier reward legend (weekly only) */}
        {s.scope === "weekly" && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <TierLegend rank="🥇 Top 3"   label="Elite"         reward="500/300/200 coins + XP" icon={Crown}   color="text-yellow-300" />
            <TierLegend rank="🥈 Top 10"  label="Advanced"      reward="100 coins + 100 XP"     icon={Medal}   color="text-secondary"  />
            <TierLegend rank="🥉 Top 20"  label="Active"        reward="40 coins + 40 XP"       icon={Shield}  color="text-accent"     />
            <TierLegend rank="✨ Rest"    label="Participation" reward="10 coins"               icon={Sparkles} color="text-muted-foreground" />
          </div>
        )}
      </header>

      <div className="flex flex-wrap gap-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => s.setScope(id)}
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all",
              s.scope === id ? "bg-gradient-primary text-primary-foreground shadow-glow-primary" : "glass text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* My standing card */}
      {myEntry && myRank && (
        <div className={cn("glass-strong rounded-2xl p-4 ring-1", tierFor(myRank).ring)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-full bg-background/60 ring-1", tierFor(myRank).ring)}>
                {(() => { const I = tierFor(myRank).icon; return <I className={cn("h-5 w-5", tierFor(myRank).color)} />; })()}
              </div>
              <div>
                <div className="font-display text-sm">
                  Rank <span className="font-bold neon-text-primary">#{myRank}</span> · <span className={tierFor(myRank).color}>{tierFor(myRank).label}</span>
                </div>
                <div className="text-xs text-muted-foreground">{valueFor(s.scope, myEntry)}</div>
              </div>
            </div>
            <div className="text-right text-xs">
              {nextDelta > 0 && (
                <div className="text-muted-foreground">
                  <span className="font-semibold text-foreground">{nextDelta} XP</span> to reach #{myRank - 1}
                </div>
              )}
              {tierDelta > 0 && tierTargetRank && (
                <div className="mt-0.5 text-accent">
                  Push <span className="font-semibold">{tierDelta} XP</span> to break into Top {tierTargetRank}
                </div>
              )}
              {!nextDelta && !tierDelta && (
                <div className="text-secondary">👑 You're at the top — defend it.</div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {s.leaderboard.length === 0 ? (
          <div className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">
            No entries yet. Complete a timer-validated quest to appear here.
          </div>
        ) : (
          s.leaderboard.map((e, i) => {
            const isMe = e.user_id === user?.id;
            const rank = i + 1;
            const tier = tierFor(rank);
            const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;
            const value = metricFor(s.scope, e);
            const pct = topValue > 0 ? Math.min(100, Math.round((value / topValue) * 100)) : 0;
            return (
              <div key={e.user_id} className={cn(
                "glass relative overflow-hidden rounded-xl p-3 ring-1 transition-all",
                isMe ? "ring-primary shadow-glow-primary" : tier.ring,
              )}>
                {/* Progress bar relative to #1 */}
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-primary/15 to-secondary/10"
                  style={{ width: `${pct}%` }}
                  aria-hidden
                />
                <div className="relative flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={cn("w-10 text-center font-mono text-sm", tier.color)}>{medal}</span>
                    <div>
                      <div className="text-sm font-medium">
                        {e.username} {isMe && <span className="text-[10px] text-primary">(you)</span>}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>🔥 {e.current_streak}d</span>
                        <span className="opacity-40">•</span>
                        <span className={tier.color}>{tier.label}</span>
                      </div>
                    </div>
                  </div>
                  <div className="font-mono text-sm font-semibold neon-text-secondary">{valueFor(s.scope, e)}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function TierLegend({ rank, label, reward, icon: Icon, color }: {
  rank: string; label: string; reward: string; icon: typeof Crown; color: string;
}) {
  return (
    <div className="glass rounded-xl p-2.5">
      <div className="flex items-center gap-1.5">
        <Icon className={cn("h-3.5 w-3.5", color)} />
        <span className={cn("font-display text-xs font-semibold", color)}>{label}</span>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">{rank}</div>
      <div className="text-[10px] text-foreground/80">{reward}</div>
    </div>
  );
}