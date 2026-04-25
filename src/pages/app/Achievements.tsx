import { usePlayer } from "@/hooks/usePlayer";
import { ACHIEVEMENTS } from "@/lib/rpg";
import { Loader2, Lock, Trophy } from "lucide-react";

export default function Achievements() {
  const p = usePlayer();
  if (p.loading) return <div className="flex h-[60vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…</div>;
  const unlocked = new Set(p.achievements.map(a => a.code));

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-secondary"><Trophy className="h-3.5 w-3.5" /> TROPHY HALL</div>
        <h1 className="mt-1 font-display text-3xl font-bold">Achievements</h1>
        <p className="mt-1 text-sm text-muted-foreground">{unlocked.size} of {ACHIEVEMENTS.length} unlocked</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ACHIEVEMENTS.map(a => {
          const got = unlocked.has(a.code);
          return (
            <div key={a.code}
              className={`glass relative overflow-hidden rounded-2xl p-4 transition-all ${got ? "shadow-glow-accent" : "opacity-60"}`}
              style={got ? { borderColor: "hsl(var(--accent) / 0.5)" } : undefined}
            >
              {got && <div className="pointer-events-none absolute -top-12 -right-10 h-32 w-32 rounded-full bg-accent/20 blur-3xl" />}
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${got ? "bg-gradient-warm text-accent-foreground shadow-glow-accent" : "bg-muted text-muted-foreground"}`}>
                {got ? <Trophy className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
              </div>
              <div className="mt-3 font-display text-base font-semibold">{a.title}</div>
              <div className="mt-0.5 text-sm text-muted-foreground">{a.description}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
