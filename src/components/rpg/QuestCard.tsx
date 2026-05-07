import { Quest, QuestProgress, QuestRich } from "@/hooks/usePlayer";
import { Check, Sparkles, Trash2, Zap, Battery, BatteryLow, BatteryFull, Lock, LockOpen, RefreshCw, CheckCircle2, Play, Pause, X, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { getQuestTimerDuration } from "@/lib/questTimer";

type Props = {
  quest: Quest | QuestRich;
  progress?: QuestProgress;
  onComplete: (id: string) => void;
  onRemove?: (id: string) => void;
  onLock?: (id: string) => void;
  onUnlock?: (id: string) => void;
  onRegenerate?: (id: string) => void;
  onSelect?: (id: string) => void;
  onStart?: (id: string, durationMinutes?: number) => void;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
  onAbandon?: (id: string) => void;
  /** Disable starting/regenerating because another quest is currently running. */
  globallyLocked?: boolean;
  variant?: "default" | "candidate" | "compulsory";
};

const TYPE_TINT: Record<string, string> = {
  daily:   "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30",
  weekly:  "bg-sky-400/15 text-sky-300 ring-sky-400/30",
  epic:    "bg-amber-400/15 text-amber-300 ring-amber-400/30",
  dynamic: "bg-violet-400/15 text-violet-300 ring-violet-400/30",
};

const ENERGY_ICON = { low: BatteryLow, medium: Battery, high: BatteryFull } as const;

function formatRemaining(ms: number) {
  if (ms <= 0) return "00:00";
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export const QuestCard = ({
  quest, progress, onComplete, onRemove, onLock, onUnlock, onRegenerate, onSelect,
  onStart, onPause, onResume, onAbandon, globallyLocked = false, variant = "default",
}: Props) => {
  const rich = quest as QuestRich;
  const qType = rich.quest_type ?? (quest.is_daily ? "daily" : "dynamic");
  const difficulty = rich.difficulty ?? 3;
  const energy = rich.energy ?? "medium";
  const Energy = ENERGY_ICON[energy];
  const pct = progress ? Math.min(100, Math.round((progress.current / Math.max(1, progress.target)) * 100)) : null;
  const isLocked = rich.status === "locked";
  const isCandidate = variant === "candidate" || rich.status === "candidate";
  const isCompulsory = variant === "compulsory" || rich.is_compulsory;
  const isInProgress = rich.status === "in_progress";
  const isPaused = rich.status === "paused";
  const isTimed = isInProgress || isPaused;

  // Intelligent: explicit durations + effort keywords, excluding small habit actions.
  const parsedDuration = getQuestTimerDuration(rich);
  const hasTimer = parsedDuration !== null;

  // Live countdown tick.
  const endsAtMs = rich.ends_at ? new Date(rich.ends_at).getTime() : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isInProgress) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isInProgress]);
  const remainingMs = endsAtMs ? endsAtMs - now : 0;
  const timerDone = isInProgress && remainingMs <= 0;
  const totalMs = (rich.duration_minutes ?? 0) * 60 * 1000;
  const timerPct = totalMs > 0 ? Math.min(100, Math.round(((totalMs - Math.max(0, remainingMs)) / totalMs) * 100)) : 0;

  // For timer quests: only the timer-completion path awards XP.
  // For instant quests: the main button just completes.
  const canStart = hasTimer && !isCandidate && !quest.completed && !isTimed && !!onStart && !globallyLocked;
  const canInstantComplete = !hasTimer && !isCandidate && !quest.completed && !isTimed && !!onComplete && !globallyLocked;
  const canCompleteNow = timerDone && !!onComplete;

  return (
    <div
      className={cn(
        "glass group relative flex items-start gap-3 rounded-2xl p-3.5 transition-all hover:-translate-y-0.5",
        quest.completed && "opacity-60",
        isLocked && "ring-1 ring-amber-400/40",
        isCandidate && "ring-1 ring-violet-400/40 bg-violet-500/5",
        isCompulsory && "ring-1 ring-emerald-400/30",
        isInProgress && "ring-2 ring-primary/60 shadow-glow-primary",
        isPaused && "ring-2 ring-amber-400/50",
        globallyLocked && !isTimed && !isCandidate && "opacity-50 pointer-events-none",
      )}
    >
      <button
        disabled={
          quest.completed || isCandidate ||
          (isTimed && !canCompleteNow) ||
          (!isTimed && !canStart && !canInstantComplete)
        }
        onClick={() => {
          if (quest.completed || isCandidate) return;
          if (canCompleteNow) return onComplete(quest.id);
          if (canInstantComplete) return onComplete(quest.id);
          if (!isTimed && canStart) return onStart!(quest.id, parsedDuration ?? undefined);
        }}
        aria-label={
          quest.completed ? "Quest completed"
            : canCompleteNow ? "Claim XP"
            : isInProgress ? "Quest running"
            : isPaused ? "Quest paused"
            : hasTimer ? "Start timer"
            : "Complete quest"
        }
        className={cn(
          "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-primary/40 transition-all",
          quest.completed
            ? "bg-gradient-primary text-primary-foreground"
            : canCompleteNow
              ? "bg-gradient-primary text-primary-foreground animate-pulse-glow"
            : isInProgress
              ? "bg-primary/20 text-primary"
            : isPaused
              ? "bg-amber-400/20 text-amber-300"
            : isCandidate
              ? "bg-muted/40 text-muted-foreground"
              : "bg-muted/60 text-muted-foreground hover:bg-primary/20 hover:text-primary hover:shadow-glow-primary animate-pulse-glow"
        )}
      >
        {quest.completed ? <Check className="h-5 w-5" />
          : canCompleteNow ? <Check className="h-5 w-5" />
          : isInProgress ? <Timer className="h-5 w-5" />
          : isPaused ? <Pause className="h-5 w-5" />
          : hasTimer ? <Play className="h-5 w-5" />
          : <Check className="h-5 w-5" />}
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
          {isInProgress && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-primary ring-1 ring-primary/40">
              <Timer className="h-3 w-3" /> {formatRemaining(remainingMs)}
            </span>
          )}
          {isPaused && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-amber-300 ring-1 ring-amber-400/30">
              <Pause className="h-3 w-3" /> PAUSED · {rich.pauses_used ?? 0}/2
            </span>
          )}
          {(rich.timer_penalty ?? 0) > 0 && (
            <span className="rounded-full bg-rose-400/15 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-rose-300 ring-1 ring-rose-400/30">
              -{Math.round((rich.timer_penalty ?? 0) * 100)}% XP
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
          {hasTimer && !isTimed && !quest.completed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-primary ring-1 ring-primary/30">
              <Timer className="h-3 w-3" /> {parsedDuration} MIN
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-1 font-mono text-secondary">
            <Zap className="h-3 w-3" /> +{quest.reward_xp} XP
          </span>
        </div>

        {isTimed && (
          <div className="mt-2">
            <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
              <span>{isPaused ? "PAUSED" : timerDone ? "DONE — claim XP" : "FOCUS TIMER"}</span>
              <span>{rich.duration_minutes} min</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-all", timerDone ? "bg-emerald-400" : "bg-gradient-primary")}
                style={{ width: `${timerPct}%` }}
              />
            </div>
            <div className="mt-2 flex items-center gap-2">
              {isInProgress && !timerDone && onPause && (
                <button onClick={() => onPause(quest.id)} disabled={(rich.pauses_used ?? 0) >= 2}
                  className="inline-flex items-center gap-1 rounded-lg bg-muted/60 px-2 py-1 font-display text-[11px] font-semibold text-foreground ring-1 ring-border hover:bg-muted disabled:opacity-50">
                  <Pause className="h-3.5 w-3.5" /> Pause ({2 - (rich.pauses_used ?? 0)} left)
                </button>
              )}
              {isPaused && onResume && (
                <button onClick={() => onResume(quest.id)}
                  className="inline-flex items-center gap-1 rounded-lg bg-gradient-primary px-2 py-1 font-display text-[11px] font-semibold text-primary-foreground shadow-glow-primary">
                  <Play className="h-3.5 w-3.5" /> Resume
                </button>
              )}
              {timerDone && onComplete && (
                <button onClick={() => onComplete(quest.id)}
                  className="inline-flex items-center gap-1 rounded-lg bg-gradient-primary px-2 py-1 font-display text-[11px] font-semibold text-primary-foreground shadow-glow-primary">
                  <Check className="h-3.5 w-3.5" /> Claim XP
                </button>
              )}
              {onAbandon && (
                <button onClick={() => onAbandon(quest.id)}
                  className="ml-auto inline-flex items-center gap-1 rounded-lg bg-muted/40 px-2 py-1 font-display text-[11px] font-semibold text-rose-300 ring-1 ring-rose-400/30 hover:bg-rose-500/10">
                  <X className="h-3.5 w-3.5" /> Abandon
                </button>
              )}
            </div>
          </div>
        )}

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
        {!isCandidate && !isCompulsory && !quest.completed && !isTimed && (
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
                disabled={globallyLocked}
                className="text-muted-foreground hover:text-primary disabled:opacity-40">
                <RefreshCw className="h-4 w-4" />
              </button>
            )}
          </>
        )}
        {onRemove && !isCompulsory && !isLocked && !isTimed && (
          <button
            onClick={() => onRemove(quest.id)}
            aria-label="Remove quest"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};
