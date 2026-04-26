import { Quest, QuestProgress, QuestRich } from "@/hooks/usePlayer";
import { Check, Sparkles, Trash2, Zap, Battery, BatteryLow, BatteryFull, Lock, LockOpen, RefreshCw, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  quest: Quest | QuestRich;
  progress?: QuestProgress;
  onComplete: (id: string) => void;
  onRemove?: (id: string) => void;
  onLock?: (id: string) => void;
  onUnlock?: (id: string) => void;
  onRegenerate?: (id: string) => void;
  onSelect?: (id: string) => void;
  variant?: "default" | "candidate" | "compulsory";
};

const TYPE_TINT: Record<string, string> = {
  daily:   "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30",
  weekly:  "bg-sky-400/15 text-sky-300 ring-sky-400/30",
  epic:    "bg-amber-400/15 text-amber-300 ring-amber-400/30",
  dynamic: "bg-violet-400/15 text-violet-300 ring-violet-400/30",
};

const ENERGY_ICON = { low: BatteryLow, medium: Battery, high: BatteryFull } as const;

export const QuestCard = ({ quest, progress, onComplete, onRemove, onLock, onUnlock, onRegenerate, onSelect, variant = "default" }: Props) => {
  const rich = quest as QuestRich;
  const qType = rich.quest_type ?? (quest.is_daily ? "daily" : "dynamic");
  const difficulty = rich.difficulty ?? 3;
  const energy = rich.energy ?? "medium";
  const Energy = ENERGY_ICON[energy];
  const pct = progress ? Math.min(100, Math.round((progress.current / Math.max(1, progress.target)) * 100)) : null;
  const isLocked = rich.status === "locked";
  const isCandidate = variant === "candidate" || rich.status === "candidate";
  const isCompulsory = variant === "compulsory" || rich.is_compulsory;

  return (
    <div
      className={cn(
        "glass group relative flex items-start gap-3 rounded-2xl p-3.5 transition-all hover:-translate-y-0.5",
        quest.completed && "opacity-60",
        isLocked && "ring-1 ring-amber-400/40",
        isCandidate && "ring-1 ring-violet-400/40 bg-violet-500/5",
        isCompulsory && "ring-1 ring-emerald-400/30",
      )}
    >
      <button
        disabled={quest.completed || isCandidate}
        onClick={() => onComplete(quest.id)}
        aria-label={quest.completed ? "Quest completed" : "Complete quest"}
        className={cn(
          "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-primary/40 transition-all",
          quest.completed
            ? "bg-gradient-primary text-primary-foreground"
            : isCandidate
              ? "bg-muted/40 text-muted-foreground"
              : "bg-muted/60 text-muted-foreground hover:bg-primary/20 hover:text-primary hover:shadow-glow-primary animate-pulse-glow"
        )}
      >
        {quest.completed ? <Check className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className={cn("font-display text-sm font-semibold leading-tight", quest.completed && "line-through")}>{quest.title}</div>
        {rich.description && (
          <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{rich.description}</div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          <span className={cn("rounded-full px-1.5 py-0.5 font-mono text-[10px] tracking-wider ring-1", TYPE_TINT[qType] ?? TYPE_TINT.daily)}>
            {qType.toUpperCase()}
          </span>
          <span className="rounded-full bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-muted-foreground ring-1 ring-border">
            DIFF {difficulty}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-muted-foreground ring-1 ring-border">
            <Energy className="h-3 w-3" /> {energy}
          </span>
          {isCompulsory && (
            <span className="rounded-full bg-emerald-400/15 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-emerald-300 ring-1 ring-emerald-400/30">ANCHOR</span>
          )}
          {isLocked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-amber-300 ring-1 ring-amber-400/30">
              <Lock className="h-3 w-3" /> LOCKED
            </span>
          )}
          {isCandidate && (
            <span className="rounded-full bg-violet-400/15 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-violet-300 ring-1 ring-violet-400/30">OPTION</span>
          )}
          {(rich.linked_stats ?? []).slice(0, 3).map(s => (
            <span key={s} className="rounded-full bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-primary ring-1 ring-primary/30">
              {s.slice(0, 3).toUpperCase()}
            </span>
          ))}
          <span className="ml-auto inline-flex items-center gap-1 font-mono text-secondary">
            <Zap className="h-3 w-3" /> +{quest.reward_xp} XP
          </span>
        </div>
        {pct !== null && (
          <div className="mt-2">
            <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
              <span>PROGRESS</span>
              <span>{progress!.current} / {progress!.target} {progress!.unit !== "count" ? progress!.unit : ""}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full xp-bar-fill transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="mt-1 flex shrink-0 flex-col gap-1">
        {isCandidate && onSelect && (
          <button
            onClick={() => onSelect(quest.id)}
            aria-label="Select this option"
            title="Select this mission"
            className="inline-flex items-center gap-1 rounded-lg bg-gradient-primary px-2 py-1 font-display text-[11px] font-semibold text-primary-foreground shadow-glow-primary transition-transform hover:scale-105"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Select
          </button>
        )}
        {!isCandidate && !isCompulsory && !quest.completed && (
          <>
            {isLocked ? (
              onUnlock && (
                <button onClick={() => onUnlock(quest.id)} aria-label="Unlock quest" title="Unlock"
                  className="text-amber-300 hover:text-amber-200">
                  <LockOpen className="h-4 w-4" />
                </button>
              )
            ) : (
              onLock && (
                <button onClick={() => onLock(quest.id)} aria-label="Lock quest" title="Lock to keep this quest"
                  className="text-muted-foreground hover:text-amber-300">
                  <Lock className="h-4 w-4" />
                </button>
              )
            )}
            {onRegenerate && !isLocked && (
              <button onClick={() => onRegenerate(quest.id)} aria-label="Regenerate slot" title="Regenerate"
                className="text-muted-foreground hover:text-primary">
                <RefreshCw className="h-4 w-4" />
              </button>
            )}
          </>
        )}
        {onRemove && !quest.is_daily && !isCompulsory && !isLocked && !isCandidate && (
          <button
            onClick={() => onRemove(quest.id)}
            aria-label="Remove quest"
            className="opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};
