import { Coins, Gem, Flame, Sparkles, Zap, AlertTriangle, Wind } from "lucide-react";
import { usePlayer, type StatusEffectKind } from "@/hooks/usePlayer";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const STATUS_META: Record<StatusEffectKind, { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  burnout:    { label: "Burnout",    icon: AlertTriangle, cls: "text-destructive border-destructive/40" },
  flow_state: { label: "Flow State", icon: Zap,           cls: "text-secondary border-secondary/40 shadow-glow-secondary" },
  fatigue:    { label: "Fatigue",    icon: Wind,          cls: "text-amber-400 border-amber-400/40" },
};

/**
 * Small floating bar showing Coins / Tokens / Fatigue / Active boost.
 * Used in the AppLayout header so the user always sees their economy.
 */
export const CurrencyBadges = ({ className }: { className?: string }) => {
  const { profile, activeEffects, statusEffects } = usePlayer();
  if (!profile) return null;

  const econ = profile as unknown as { coins: number; tokens: number; exhaustion: number };
  const coins = econ.coins ?? 0;
  const tokens = econ.tokens ?? 0;
  const exhaustion = econ.exhaustion ?? 0;
  const boost = activeEffects?.find(
    (e) => e.effect_kind === "xp_multiplier" && (!e.expires_at || new Date(e.expires_at) > new Date()),
  );

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="glass flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-mono">
        <Coins className="h-3.5 w-3.5 text-amber-400" />
        <span className="font-semibold tabular-nums text-foreground">{coins}</span>
      </div>
      <div className="glass flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-mono">
        <Gem className="h-3.5 w-3.5 text-secondary" />
        <span className="font-semibold tabular-nums text-foreground">{tokens}</span>
      </div>
      <div
        className={cn(
          "glass flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-mono",
          exhaustion >= 70 ? "text-destructive" : exhaustion >= 40 ? "text-amber-400" : "text-muted-foreground",
        )}
        title={`Exhaustion ${exhaustion}/100 — recovers over time`}
      >
        <Flame className="h-3.5 w-3.5" />
        <span className="font-semibold tabular-nums">{exhaustion}</span>
      </div>
      {boost && (
        <div className="glass flex items-center gap-1.5 rounded-lg border border-primary/40 px-2.5 py-1 text-xs font-mono text-primary shadow-glow-primary">
          <Sparkles className="h-3.5 w-3.5" />
          <span className="font-semibold">x{boost.effect_value.toFixed(2)}</span>
        </div>
      )}
      {statusEffects?.map((s) => {
        const meta = STATUS_META[s.kind];
        const Icon = meta.icon;
        return (
          <Tooltip key={s.id}>
            <TooltipTrigger asChild>
              <div className={cn("glass flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-mono", meta.cls)}>
                <Icon className="h-3.5 w-3.5" />
                <span className="font-semibold">{meta.label}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[220px]">
              <div className="text-xs">
                <div className="font-semibold mb-1">{meta.label} {s.multiplier !== 1 && `(x${s.multiplier.toFixed(2)} XP)`}</div>
                <div className="text-muted-foreground">{s.reason ?? "Active behavioral status."}</div>
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
};