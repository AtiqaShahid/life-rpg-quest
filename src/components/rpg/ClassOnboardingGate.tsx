import { usePlayer, type CharacterClass } from "@/hooks/usePlayer";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Full-screen modal that blocks the dashboard until the user picks a starting class.
 * Only shown when profile.class_type IS NULL.
 */
export const ClassOnboardingGate = () => {
  const { profile, classCatalog, selectClass, loading } = usePlayer();
  const [busy, setBusy] = useState<CharacterClass | null>(null);

  const econ = profile as unknown as { class_type: CharacterClass | null } | null;
  if (loading || !profile) return null;
  if (econ?.class_type) return null;

  const onPick = async (cls: CharacterClass) => {
    setBusy(cls);
    try { await selectClass(cls, false); } finally { setBusy(null); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 p-4 backdrop-blur-md">
      <div className="glass-strong w-full max-w-3xl space-y-5 overflow-y-auto rounded-3xl border border-primary/30 p-6 shadow-glow-primary sm:p-8" style={{ maxHeight: "92vh" }}>
        <div className="text-center">
          <div className="font-mono text-[10px] tracking-[0.3em] text-secondary">CHARACTER CREATION</div>
          <h2 className="mt-1 font-display text-2xl font-bold neon-text-primary sm:text-3xl">Choose your path</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your class shapes how XP is earned and how your story unfolds. You can change later (7-day cooldown or 500 coins).
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {classCatalog.map((c) => (
            <button
              key={c.id}
              onClick={() => onPick(c.id)}
              disabled={busy !== null}
              className={cn(
                "glass group flex flex-col gap-2 rounded-2xl border border-border/50 p-4 text-left transition-all",
                "hover:border-primary/60 hover:shadow-glow-primary",
                busy === c.id && "opacity-60",
              )}
            >
              <div className="flex items-start gap-3">
                <div className="text-3xl leading-none">{c.icon}</div>
                <div>
                  <div className="font-display text-lg font-bold">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.tagline}</div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{c.description}</p>
              <ul className="mt-1 space-y-0.5 text-[11px]">
                {c.strengths.map((s) => (
                  <li key={s} className="text-foreground/90">• {s}</li>
                ))}
              </ul>
              <div className="mt-2">
                <Button size="sm" className="w-full" disabled={busy !== null}>
                  {busy === c.id ? "Setting class…" : `Become a ${c.name}`}
                </Button>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};