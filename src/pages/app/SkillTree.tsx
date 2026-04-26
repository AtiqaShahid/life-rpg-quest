import { usePlayer } from "@/hooks/usePlayer";
import { Loader2, Sparkles, Lock, Check } from "lucide-react";
import { statMeta, type StatKey } from "@/lib/rpg";
import { cn } from "@/lib/utils";
import type { SkillCatalog } from "@/lib/progression";

const STATS: StatKey[] = ["intelligence", "strength", "discipline", "charisma"];

function nodeLevel(skillId: string, nodes: { skill_id: string; level: number }[]) {
  return nodes.find(n => n.skill_id === skillId)?.level ?? 0;
}

function isUnlocked(skill: SkillCatalog, nodes: { skill_id: string; level: number }[]) {
  if (!skill.parent_id) return true;
  return nodeLevel(skill.parent_id, nodes) >= 1;
}

export default function SkillTree() {
  const p = usePlayer();
  if (p.loading || !p.profile) {
    return <div className="flex h-[60vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…</div>;
  }

  const skillsByStat = (stat: StatKey) =>
    p.skillCatalog.filter(s => s.stat === stat).sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-secondary">
            <Sparkles className="h-3.5 w-3.5" /> SKILL TREE
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold">Specialize your character</h1>
          <p className="mt-1 text-sm text-muted-foreground">Spend skill points to unlock multipliers and reduce penalties.</p>
        </div>
        <div className="glass-strong rounded-2xl px-4 py-2.5 text-right">
          <div className="font-mono text-[10px] tracking-widest text-muted-foreground">SKILL POINTS</div>
          <div className="font-display text-2xl font-bold text-primary">{p.profile.skill_points}</div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {STATS.map((stat) => {
          const meta = statMeta[stat];
          const skills = skillsByStat(stat);
          const root = skills.find(s => s.parent_id === null);
          const children = skills.filter(s => s.parent_id !== null);

          return (
            <section key={stat} className="glass-strong rounded-3xl p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="font-mono text-[10px] tracking-widest text-muted-foreground">{meta.short}</div>
                  <div className="font-display text-xl font-semibold" style={{ color: `hsl(${meta.colorVar})` }}>
                    {meta.label}
                  </div>
                </div>
                {root && (
                  <button
                    onClick={() => p.upgradeSkill(root.id)}
                    disabled={nodeLevel(root.id, p.skillNodes) >= 1 || p.profile!.skill_points < root.cost_per_level}
                    className={cn(
                      "rounded-xl px-3 py-1.5 font-mono text-[10px] tracking-widest transition-all",
                      nodeLevel(root.id, p.skillNodes) >= 1
                        ? "bg-muted/40 text-muted-foreground"
                        : "bg-primary/15 text-primary hover:bg-primary/25"
                    )}
                  >
                    {nodeLevel(root.id, p.skillNodes) >= 1 ? "✓ AWAKENED" : `AWAKEN — 1 SP`}
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {children.map((skill) => {
                  const lvl = nodeLevel(skill.id, p.skillNodes);
                  const unlocked = isUnlocked(skill, p.skillNodes);
                  const max = lvl >= skill.max_level;
                  const canUpgrade = unlocked && !max && p.profile!.skill_points >= skill.cost_per_level;
                  return (
                    <div
                      key={skill.id}
                      className={cn(
                        "rounded-2xl border px-4 py-3 transition-all",
                        unlocked ? "border-border bg-muted/20" : "border-border/40 bg-muted/10 opacity-60"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {!unlocked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                            {max && <Check className="h-3.5 w-3.5 text-secondary" />}
                            <div className="font-display text-sm font-semibold">{skill.label}</div>
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">{skill.description}</div>
                          <div className="mt-2 flex items-center gap-1.5">
                            {Array.from({ length: skill.max_level }).map((_, i) => (
                              <div
                                key={i}
                                className={cn(
                                  "h-1.5 w-6 rounded-full transition-all",
                                  i < lvl ? "bg-primary shadow-glow-primary" : "bg-muted"
                                )}
                              />
                            ))}
                            <span className="ml-2 font-mono text-[10px] text-muted-foreground">{lvl}/{skill.max_level}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => p.upgradeSkill(skill.id)}
                          disabled={!canUpgrade}
                          className={cn(
                            "shrink-0 rounded-xl px-3 py-1.5 font-mono text-[10px] tracking-widest transition-all",
                            canUpgrade
                              ? "bg-gradient-primary text-primary-foreground shadow-elegant hover:opacity-95"
                              : "cursor-not-allowed bg-muted/40 text-muted-foreground"
                          )}
                        >
                          {max ? "MAX" : !unlocked ? "LOCKED" : `+1 — ${skill.cost_per_level} SP`}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
