import { ActivityType } from "@/hooks/usePlayer";
import * as Lucide from "lucide-react";
import { statMeta } from "@/lib/rpg";
import { cn } from "@/lib/utils";

type Props = { types: ActivityType[]; onPick: (id: string) => void; compact?: boolean };

export const ActivityPicker = ({ types, onPick, compact }: Props) => {
  return (
    <div className={cn("grid gap-3", compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4")}>
      {types.map((t) => {
        const Icon = (Lucide as unknown as Record<string, Lucide.LucideIcon>)[t.icon] ?? Lucide.Zap;
        const meta = statMeta[t.stat];
        return (
          <button
            key={t.id}
            onClick={() => onPick(t.id)}
            className="glass group relative flex flex-col items-start gap-2 overflow-hidden rounded-2xl p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-glow-primary"
          >
            <div className="absolute inset-0 -z-10 opacity-0 transition-opacity group-hover:opacity-100"
              style={{ background: `radial-gradient(circle at 30% 0%, hsl(${meta.colorVar} / 0.18), transparent 70%)` }} />
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl ring-1"
              style={{
                background: `hsl(${meta.colorVar} / 0.15)`,
                color: `hsl(${meta.colorVar})`,
                boxShadow: `0 0 18px hsl(${meta.colorVar} / 0.3)`,
              }}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="font-display text-base font-semibold leading-tight">{t.label}</div>
            {t.description && !compact && <div className="text-xs text-muted-foreground">{t.description}</div>}
            <div className="mt-1 flex w-full items-center justify-between">
              <span className="font-mono text-[10px] tracking-widest text-muted-foreground">{statMeta[t.stat].short}</span>
              <span className="rounded-full bg-secondary/15 px-2 py-0.5 font-mono text-xs font-semibold text-secondary">+{t.xp} XP</span>
            </div>
          </button>
        );
      })}
    </div>
  );
};
