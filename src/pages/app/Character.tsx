import { useMemo, useState } from "react";
import { usePlayer, type CharacterClass, type ClassConfig } from "@/hooks/usePlayer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Coins, Lock, Check, Sparkles, AlertTriangle, Zap, Wind } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_META = {
  burnout:    { label: "Burnout",    icon: AlertTriangle, color: "text-destructive border-destructive/40" },
  flow_state: { label: "Flow State", icon: Zap,           color: "text-secondary border-secondary/40" },
  fatigue:    { label: "Fatigue",    icon: Wind,          color: "text-amber-400 border-amber-400/40" },
} as const;

function ClassCard({
  cfg, current, cooldownRemaining, coins, onSelect,
}: {
  cfg: ClassConfig;
  current: CharacterClass | null;
  cooldownRemaining: number; // days
  coins: number;
  onSelect: (cls: CharacterClass, payToSkip: boolean) => void;
}) {
  const isActive = current === cfg.id;
  const onCooldown = cooldownRemaining > 0 && !isActive && current !== null;
  const skipCost = 500;
  const canPay = coins >= skipCost;

  return (
    <Card className={cn(
      "glass relative flex flex-col gap-4 rounded-2xl border p-5 transition-all",
      isActive ? "border-primary/60 shadow-glow-primary" : "border-border/50 hover:border-primary/30",
    )}>
      {isActive && (
        <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-primary">
          <Check className="h-3 w-3" /> Active
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className="text-4xl leading-none">{cfg.icon}</div>
        <div>
          <h3 className="font-display text-xl font-bold">{cfg.name}</h3>
          <p className="text-xs text-muted-foreground">{cfg.tagline}</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{cfg.description}</p>
      <div className="space-y-2 text-xs">
        <div>
          <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-secondary">Strengths</div>
          <ul className="space-y-1">
            {cfg.strengths.map((s) => (
              <li key={s} className="flex items-start gap-2 text-foreground/90">
                <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" /> {s}
              </li>
            ))}
          </ul>
        </div>
        {cfg.weaknesses.length > 0 && (
          <div>
            <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Trade-offs</div>
            <ul className="space-y-1">
              {cfg.weaknesses.map((w) => (
                <li key={w} className="text-muted-foreground">— {w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="mt-auto flex flex-col gap-2">
        {isActive ? (
          <Button disabled className="w-full">Currently active</Button>
        ) : onCooldown ? (
          <>
            <Button disabled variant="outline" className="w-full">
              <Lock className="mr-2 h-3.5 w-3.5" /> {cooldownRemaining.toFixed(1)}d cooldown
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              disabled={!canPay}
              onClick={() => onSelect(cfg.id, true)}
            >
              <Coins className="mr-2 h-3.5 w-3.5 text-amber-400" />
              Bypass — {skipCost} coins
            </Button>
          </>
        ) : (
          <Button className="w-full" onClick={() => onSelect(cfg.id, false)}>
            {current ? "Switch class" : "Choose this path"}
          </Button>
        )}
      </div>
    </Card>
  );
}

export default function Character() {
  const { profile, classCatalog, statusEffects, selectClass, evaluateStatus, loading } = usePlayer();
  const [busy, setBusy] = useState(false);

  const econ = profile as unknown as { class_type: CharacterClass | null; class_changed_at: string | null; coins: number } | null;
  const current = econ?.class_type ?? null;
  const coins = econ?.coins ?? 0;

  const cooldownRemaining = useMemo(() => {
    if (!econ?.class_changed_at) return 0;
    const elapsedMs = Date.now() - new Date(econ.class_changed_at).getTime();
    const remainingMs = 7 * 24 * 60 * 60 * 1000 - elapsedMs;
    return Math.max(0, remainingMs / (24 * 60 * 60 * 1000));
  }, [econ?.class_changed_at]);

  const onSelect = async (cls: CharacterClass, payToSkip: boolean) => {
    setBusy(true);
    try { await selectClass(cls, payToSkip); } finally { setBusy(false); }
  };

  if (loading) return <div className="p-6 text-muted-foreground">Loading character…</div>;

  return (
    <div className="space-y-6">
      <div className="glass-strong rounded-2xl border border-border/50 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold neon-text-primary sm:text-3xl">Character</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your class shapes how XP is earned. Behavioral status effects adapt to your patterns.
            </p>
          </div>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => evaluateStatus()}>
            Re-evaluate status
          </Button>
        </div>

        {/* Active status effects */}
        {statusEffects && statusEffects.length > 0 && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {statusEffects.map((s) => {
              const meta = STATUS_META[s.kind];
              const Icon = meta.icon;
              const expires = new Date(s.expires_at);
              const hoursLeft = Math.max(0, Math.round((expires.getTime() - Date.now()) / (60 * 60 * 1000)));
              return (
                <div key={s.id} className={cn("glass rounded-xl border p-3", meta.color)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-display text-sm font-semibold">
                      <Icon className="h-4 w-4" /> {meta.label}
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground">{hoursLeft}h left</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{s.reason}</p>
                  <div className="mt-1 font-mono text-[11px]">
                    {s.multiplier !== 1 && <span>XP × {s.multiplier.toFixed(2)}</span>}
                    {s.difficulty_modifier !== 0 && <span className="ml-2">Difficulty {s.difficulty_modifier > 0 ? "+" : ""}{s.difficulty_modifier}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
        {classCatalog.map((cfg) => (
          <ClassCard
            key={cfg.id}
            cfg={cfg}
            current={current}
            cooldownRemaining={cooldownRemaining}
            coins={coins}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}