import { useSocial, type LeaderboardScope } from "@/hooks/useSocial";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { Brain, Dumbbell, Flame, Globe, Trophy, Users } from "lucide-react";

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

export default function LeaderboardPage() {
  const { user } = useAuth();
  const s = useSocial();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold neon-text-primary">Leaderboards</h1>
        <p className="text-sm text-muted-foreground">Compete in scoped rankings — no global anxiety.</p>
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

      <div className="space-y-1.5">
        {s.leaderboard.length === 0 ? (
          <div className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">
            No entries yet. Log activities to appear here.
          </div>
        ) : (
          s.leaderboard.map((e, i) => {
            const isMe = e.user_id === user?.id;
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
            return (
              <div key={e.user_id} className={cn(
                "glass flex items-center justify-between rounded-xl p-3",
                isMe && "ring-1 ring-primary",
              )}>
                <div className="flex items-center gap-3">
                  <span className="w-10 text-center font-mono text-sm">{medal}</span>
                  <div>
                    <div className="text-sm font-medium">{e.username} {isMe && <span className="text-[10px] text-primary">(you)</span>}</div>
                    <div className="text-[11px] text-muted-foreground">🔥 {e.current_streak}d streak</div>
                  </div>
                </div>
                <div className="font-mono text-sm font-semibold neon-text-secondary">{valueFor(s.scope, e)}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}