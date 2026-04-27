import { Coins, Gem, Flame, Sparkles } from "lucide-react";
import { usePlayer } from "@/hooks/usePlayer";
import { cn } from "@/lib/utils";

/**
 * Small floating bar showing Coins / Tokens / Fatigue / Active boost.
 * Used in the AppLayout header so the user always sees their economy.
 */
export const CurrencyBadges = ({ className }: { className?: string }) => {
  const { profile, activeEffects } = usePlayer();
  if (!profile) return null;

  const econ = profile as unknown as { coins: number; tokens: number; fatigue: number };
  const coins = econ.coins ?? 0;
  const tokens = econ.tokens ?? 0;
  const fatigue = econ.fatigue ?? 0;
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
          fatigue >= 70 ? "text-destructive" : fatigue >= 40 ? "text-amber-400" : "text-muted-foreground",
        )}
        title={`Fatigue ${fatigue}/100`}
      >
        <Flame className="h-3.5 w-3.5" />
        <span className="font-semibold tabular-nums">{fatigue}</span>
      </div>
      {boost && (
        <div className="glass flex items-center gap-1.5 rounded-lg border border-primary/40 px-2.5 py-1 text-xs font-mono text-primary shadow-glow-primary">
          <Sparkles className="h-3.5 w-3.5" />
          <span className="font-semibold">x{boost.effect_value.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
};