import { usePlayer } from "@/hooks/usePlayer";
import { StatBadge } from "@/components/rpg/StatBadge";
import { XpBar } from "@/components/rpg/XpBar";
import { Loader2, BarChart3, Flame } from "lucide-react";
import { statMeta, xpToNext, type StatKey } from "@/lib/rpg";

export default function StatsPage() {
  const p = usePlayer();
  if (p.loading || !p.profile || !p.stats || !p.streak) return <div className="flex h-[60vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…</div>;

  const total = (Object.keys(statMeta) as StatKey[]).reduce((acc, k) => acc + p.stats![k], 0);
  const totalActivities = p.activities.length;
  const xpFromHistory = p.activities.reduce((acc, a) => acc + a.xp_gained, 0);

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-secondary"><BarChart3 className="h-3.5 w-3.5" /> CHARACTER SHEET</div>
        <h1 className="mt-1 font-display text-3xl font-bold">Stats</h1>
      </header>

      <section className="glass-strong rounded-3xl p-6">
        <div className="grid gap-6 sm:grid-cols-[1fr,auto] sm:items-center">
          <div>
            <div className="font-mono text-[11px] tracking-widest text-muted-foreground">LEVEL {p.profile.level}</div>
            <div className="font-display text-2xl font-bold">{p.profile.username}</div>
            <div className="mt-3 max-w-md">
              <XpBar value={p.profile.xp} max={xpToNext(p.profile.level)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center sm:grid-cols-1">
            <div className="glass rounded-xl px-4 py-2"><div className="font-mono text-[10px] tracking-widest text-muted-foreground">TOTAL STAT</div><div className="font-display text-xl font-bold">{total}</div></div>
            <div className="glass rounded-xl px-4 py-2"><div className="font-mono text-[10px] tracking-widest text-muted-foreground">ACTIVITIES</div><div className="font-display text-xl font-bold">{totalActivities}</div></div>
            <div className="glass rounded-xl px-4 py-2"><div className="font-mono text-[10px] tracking-widest text-muted-foreground">XP EARNED</div><div className="font-display text-xl font-bold text-secondary">{xpFromHistory.toLocaleString()}</div></div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Core stats</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatBadge stat="intelligence" value={p.stats.intelligence} />
          <StatBadge stat="strength" value={p.stats.strength} />
          <StatBadge stat="discipline" value={p.stats.discipline} />
          <StatBadge stat="charisma" value={p.stats.charisma} />
        </div>
      </section>

      <section className="glass-strong rounded-3xl p-6">
        <div className="flex items-center gap-3">
          <Flame className="h-6 w-6 animate-flame text-accent" />
          <div>
            <div className="font-display text-lg font-semibold">{p.streak.current_streak} day streak</div>
            <div className="text-xs text-muted-foreground">Longest: {p.streak.longest_streak} days · Last active: {p.streak.last_active_date ?? "—"}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
