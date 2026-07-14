import { useMemo, lazy, Suspense } from "react";
import { usePlayer, type QuestRich } from "@/hooks/usePlayer";
import { useSocial } from "@/hooks/useSocial";
import { useAuth } from "@/context/AuthContext";
import { CharacterCard } from "@/components/rpg/CharacterCard";
import { StatusEffectsPanel } from "@/components/rpg/StatusEffectsPanel";
import { QuestCard } from "@/components/rpg/QuestCard";
import * as Lucide from "lucide-react";
import { Scroll, Activity as ActivityIcon, TrendingUp, Trophy, Users, Crown, Shield, Eye } from "lucide-react";
import { format } from "date-fns";
import { statMeta } from "@/lib/rpg";
import { subtypeLabel } from "@/lib/activityCatalog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const DailyProgressChart = lazy(() => import("@/components/rpg/DailyProgressChart"));

const SectionTitle = ({ icon: Icon, title, hint }: { icon: React.ComponentType<{ className?: string }>; title: string; hint?: string }) => (
  <div className="mb-3 flex items-end justify-between">
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-secondary" />
      <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
    </div>
    {hint && <span className="font-mono text-[10px] tracking-widest text-muted-foreground">{hint}</span>}
  </div>
);

// Rank tiers based on level
const RANK_TIERS = [
  { name: "Bronze",   minLevel: 1,  color: "from-amber-700 to-amber-500",    icon: "🥉", ring: "ring-amber-500/40" },
  { name: "Silver",   minLevel: 5,  color: "from-slate-400 to-slate-200",    icon: "🥈", ring: "ring-slate-300/40" },
  { name: "Gold",     minLevel: 10, color: "from-yellow-500 to-yellow-300",  icon: "🥇", ring: "ring-yellow-400/40" },
  { name: "Platinum", minLevel: 20, color: "from-cyan-400 to-sky-300",       icon: "💎", ring: "ring-cyan-300/40" },
  { name: "Diamond",  minLevel: 35, color: "from-blue-400 to-indigo-300",    icon: "💠", ring: "ring-blue-300/40" },
  { name: "Master",   minLevel: 50, color: "from-fuchsia-500 to-pink-400",   icon: "👑", ring: "ring-fuchsia-400/40" },
  { name: "Elite",    minLevel: 75, color: "from-rose-500 to-orange-400",    icon: "⚜️", ring: "ring-rose-400/40" },
];

function getRank(level: number) {
  let current = RANK_TIERS[0];
  let next: typeof RANK_TIERS[0] | null = null;
  for (let i = 0; i < RANK_TIERS.length; i++) {
    if (level >= RANK_TIERS[i].minLevel) {
      current = RANK_TIERS[i];
      next = RANK_TIERS[i + 1] ?? null;
    }
  }
  const progress = next
    ? Math.min(100, ((level - current.minLevel) / (next.minLevel - current.minLevel)) * 100)
    : 100;
  return { current, next, progress };
}

export default function Dashboard() {
  const p = usePlayer();
  const { user } = useAuth();
  const social = useSocial();
  const { toast } = useToast();

  // ---- Today's activities ----
  const todayStr = new Date().toISOString().slice(0, 10);
  const todaysActivities = useMemo(
    () => p.activities.filter(a => a.activity_date === todayStr || a.created_at.slice(0, 10) === todayStr),
    [p.activities, todayStr],
  );

  // ---- Hourly XP chart for today ----
  const hourlyChart = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, label: `${h.toString().padStart(2, "0")}:00`, xp: 0, count: 0, cumXp: 0 }));
    for (const a of todaysActivities) {
      const h = new Date(a.created_at).getHours();
      buckets[h].xp += a.xp_gained;
      buckets[h].count += 1;
    }
    let cum = 0;
    for (const b of buckets) { cum += b.xp; b.cumXp = cum; }
    const nowHour = new Date().getHours();
    return buckets.slice(0, Math.max(nowHour + 1, 6));
  }, [todaysActivities]);

  if (p.loading || !p.profile || !p.stats || !p.streak) {
    return <DashboardSkeleton />;
  }

  // ---- Pending quests only ----
  const pendingQuests = (p.quests as QuestRich[]).filter((q) => {
    if (q.completed) return false;
    const status = q.status;
    return !status || status === "active" || status === "locked";
  });

  const todayXp = todaysActivities.reduce((s, a) => s + a.xp_gained, 0);
  const todayCount = todaysActivities.length;

  // ---- Recent achievements (last 5) ----
  const recentAchievements = p.achievements.slice(0, 5);

  // ---- Rank ----
  const rank = getRank(p.profile.level);

  // ---- Social comparison ----
  const myEntry = social.leaderboard.find(e => e.user_id === user?.id);
  const myWeekly = myEntry?.weekly_xp ?? 0;
  // Top 3 friends/party (excluding self)
  const friendsCompare = social.leaderboard.filter(e => e.user_id !== user?.id).slice(0, 3);
  const compareMax = Math.max(myWeekly, ...friendsCompare.map(f => f.weekly_xp), 1);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Hero: Character */}
      <CharacterCard
        profile={p.profile}
        stats={p.stats}
        streak={p.streak}
        xpFlash={p.xpFlash}
        levelUpFlash={p.levelUpFlash}
      />

      {/* Rank + Status row */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Rank Card */}
        <div className={`glass relative overflow-hidden rounded-2xl p-5 ring-1 ${rank.current.ring} lg:col-span-1`}>
          <div className={`pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br ${rank.current.color} opacity-20 blur-3xl`} />
          <div className="flex items-center gap-2 text-xs font-mono tracking-widest text-muted-foreground">
            <Crown className="h-3.5 w-3.5 text-secondary" /> CURRENT RANK
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${rank.current.color} text-3xl shadow-lg`}>
              {rank.current.icon}
            </div>
            <div>
              <div className="font-display text-2xl font-bold leading-tight">{rank.current.name}</div>
              <div className="font-mono text-[11px] text-muted-foreground">LEVEL {p.profile.level}</div>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
              <span>{rank.next ? `NEXT: ${rank.next.name}` : "MAX RANK"}</span>
              <span>{rank.next ? `LV ${rank.next.minLevel}` : "—"}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted/60 ring-1 ring-inset ring-primary/20">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${rank.current.color} transition-all duration-700`}
                style={{ width: `${rank.progress}%` }}
              />
            </div>
            <div className="mt-1 text-right font-mono text-[10px] text-secondary">{rank.progress.toFixed(0)}%</div>
          </div>
        </div>

        {/* Status effects (kept) */}
        <div className="lg:col-span-2">
          <StatusEffectsPanel />
        </div>
      </div>

      {/* Daily Progression chart */}
      <section>
        <SectionTitle icon={TrendingUp} title="Today's progression" hint={`${todayXp} XP • ${todayCount} ACTIONS`} />
        <div className="glass rounded-2xl p-4 sm:p-5">
          <div className="mb-3 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-primary/10 p-3 ring-1 ring-primary/30">
              <div className="font-mono text-[10px] tracking-widest text-muted-foreground">XP TODAY</div>
              <div className="font-display text-2xl font-bold text-primary">{todayXp}</div>
            </div>
            <div className="rounded-xl bg-secondary/10 p-3 ring-1 ring-secondary/30">
              <div className="font-mono text-[10px] tracking-widest text-muted-foreground">ACTIONS</div>
              <div className="font-display text-2xl font-bold text-secondary">{todayCount}</div>
            </div>
            <div className="rounded-xl bg-accent/10 p-3 ring-1 ring-accent/30">
              <div className="font-mono text-[10px] tracking-widest text-muted-foreground">STREAK</div>
              <div className="font-display text-2xl font-bold text-accent">{p.streak.current_streak}🔥</div>
            </div>
          </div>
          <Suspense fallback={<Skeleton className="h-44 sm:h-48 w-full rounded-xl" />}>
            <DailyProgressChart data={hourlyChart} />
          </Suspense>
        </div>
      </section>

      {/* Pending quests + Today's activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionTitle icon={Scroll} title="Pending quests" hint={`${pendingQuests.length} TO GO`} />
          <div className="space-y-2">
            {pendingQuests.length === 0 ? (
              <div className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">
                ✨ All quests cleared! Visit the Quests tab to take on more.
              </div>
            ) : (
              pendingQuests.slice(0, 6).map(q => {
                const progress = p.questProgress.find(qp => qp.quest_id === q.id);
                return (
                  <div
                    key={q.id}
                    onClick={() =>
                      toast({
                        title: "Preview only",
                        description: "Go to the Quests tab to select or complete this mission.",
                      })
                    }
                    className="cursor-pointer"
                  >
                    <QuestCard
                      quest={q}
                      progress={progress}
                      onComplete={p.completeQuest}
                      readOnly
                    />
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section>
          <SectionTitle icon={ActivityIcon} title="Today's activity" hint={format(new Date(), "MMM d")} />
          <div className="glass rounded-2xl p-3">
            {todaysActivities.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No activity yet today — log your first action to start! ⚡
              </div>
            ) : (
              <ol className="relative space-y-3 pl-5">
                <span className="absolute left-1.5 top-1 bottom-1 w-px bg-gradient-to-b from-primary/60 via-secondary/40 to-transparent" />
                {todaysActivities.slice(0, 10).map(a => {
                  const t = p.activityTypes.find(x => x.id === a.type_id);
                  const Icon = t ? ((Lucide as unknown as Record<string, Lucide.LucideIcon>)[t.icon] ?? Lucide.Zap) : Lucide.Zap;
                  const color = t ? `hsl(${statMeta[t.stat].colorVar})` : "hsl(var(--primary))";
                  const sub = subtypeLabel(a.type_id, a.subtype);
                  return (
                    <li key={a.id} className="relative animate-fade-in">
                      <span
                        className="absolute -left-[18px] top-1 flex h-3 w-3 items-center justify-center rounded-full ring-2 ring-background"
                        style={{ background: color }}
                      />
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-white/10"
                          style={{ background: color.replace(")", " / 0.15)"), color }}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium leading-tight">{t?.label ?? a.type_id}</div>
                          {sub && <div className="truncate font-mono text-[10px] text-muted-foreground">{sub}</div>}
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-xs font-semibold text-secondary">+{a.xp_gained} XP</div>
                          <div className="font-mono text-[10px] text-muted-foreground">{format(new Date(a.created_at), "HH:mm")}</div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </section>
      </div>

      {/* Achievements + Social compare */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionTitle icon={Trophy} title="Recent achievements" hint={`${p.achievements.length} TOTAL`} />
          {recentAchievements.length === 0 ? (
            <div className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">
              No achievements yet — keep grinding! 🏆
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {recentAchievements.map(a => (
                <div
                  key={a.id}
                  className="glass group relative flex flex-col items-center gap-2 rounded-2xl p-4 text-center ring-1 ring-amber-400/20 transition-all hover:-translate-y-1 hover:ring-amber-400/50"
                >
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-500/10 to-transparent opacity-50" />
                  <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-yellow-600 text-2xl shadow-lg shadow-amber-500/30">
                    🏆
                  </div>
                  <div className="relative font-display text-sm font-semibold leading-tight">{a.title}</div>
                  <div className="relative font-mono text-[9px] text-muted-foreground">
                    {format(new Date(a.unlocked_at), "MMM d")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionTitle icon={Users} title="You vs Friends" hint="THIS WEEK" />
          <div className="glass rounded-2xl p-4">
            {friendsCompare.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Add friends to see how you compare 🤝
              </div>
            ) : (
              <div className="space-y-3">
                {/* You */}
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-display font-semibold text-primary">You</span>
                    <span className="font-mono text-secondary">{myWeekly} XP</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted/60 ring-1 ring-inset ring-primary/20">
                    <div
                      className="h-full rounded-full xp-bar-fill transition-all duration-700"
                      style={{ width: `${(myWeekly / compareMax) * 100}%` }}
                    />
                  </div>
                </div>
                {friendsCompare.map((f, idx) => {
                  const ahead = myWeekly >= f.weekly_xp;
                  return (
                    <div key={f.user_id}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 truncate font-medium text-foreground">
                          <Shield className="h-3 w-3 text-muted-foreground" />
                          {f.username}
                        </span>
                        <span className={`font-mono ${ahead ? "text-muted-foreground" : "text-accent"}`}>
                          {f.weekly_xp} XP
                          {!ahead && <span className="ml-1 text-[10px]">▲ +{f.weekly_xp - myWeekly}</span>}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted/60 ring-1 ring-inset ring-border">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-muted-foreground/60 to-muted-foreground/30 transition-all duration-700"
                          style={{ width: `${(f.weekly_xp / compareMax) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in">
      <div className="glass-strong rounded-3xl p-4 sm:p-6 md:p-8">
        <div className="grid items-center gap-5 md:grid-cols-[auto,1fr] md:gap-8">
          <div className="mx-auto md:mx-0">
            <Skeleton className="h-28 w-28 sm:h-36 sm:w-36 md:h-44 md:w-44 lg:h-48 lg:w-48 rounded-full" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-3 w-full" />
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-40 rounded-2xl lg:col-span-1" />
        <Skeleton className="h-40 rounded-2xl lg:col-span-2" />
      </div>
      <Skeleton className="h-72 w-full rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}
