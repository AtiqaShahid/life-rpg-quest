import { Brain, Dumbbell, Shield, Sparkles, type LucideIcon } from "lucide-react";
import { StatKey, statMeta } from "@/lib/rpg";

const iconMap: Record<StatKey, LucideIcon> = {
  intelligence: Brain, strength: Dumbbell, discipline: Shield, charisma: Sparkles,
};

export const StatBadge = ({ stat, value }: { stat: StatKey; value: number }) => {
  const Icon = iconMap[stat];
  const meta = statMeta[stat];
  return (
    <div className="glass group relative flex flex-col items-center gap-1 rounded-xl p-2 sm:p-3 transition-all hover:scale-[1.03]" style={{ borderColor: `hsl(${meta.colorVar} / 0.4)` }}>
      <div
        className="flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-lg ring-1 transition-all group-hover:scale-110"
        style={{
          background: `hsl(${meta.colorVar} / 0.18)`,
          color: `hsl(${meta.colorVar})`,
          boxShadow: `0 0 18px hsl(${meta.colorVar} / 0.35)`,
        }}
      >
        <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </div>
      <div className="font-mono text-[9px] sm:text-[10px] tracking-widest text-muted-foreground">{meta.short}</div>
      <div className="font-display text-base sm:text-xl font-semibold leading-none" style={{ color: `hsl(${meta.colorVar})` }}>{value}</div>
    </div>
  );
};
