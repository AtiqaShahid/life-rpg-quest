import { Quest } from "@/hooks/usePlayer";
import { Check, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = { quest: Quest; onComplete: (id: string) => void; onRemove?: (id: string) => void };

export const QuestCard = ({ quest, onComplete, onRemove }: Props) => {
  return (
    <div
      className={cn(
        "glass group relative flex items-center gap-3 rounded-2xl p-3.5 transition-all hover:-translate-y-0.5",
        quest.completed && "opacity-60"
      )}
    >
      <button
        disabled={quest.completed}
        onClick={() => onComplete(quest.id)}
        aria-label={quest.completed ? "Quest completed" : "Complete quest"}
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-primary/40 transition-all",
          quest.completed
            ? "bg-gradient-primary text-primary-foreground"
            : "bg-muted/60 text-muted-foreground hover:bg-primary/20 hover:text-primary hover:shadow-glow-primary animate-pulse-glow"
        )}
      >
        {quest.completed ? <Check className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className={cn("font-medium leading-tight truncate", quest.completed && "line-through")}>{quest.title}</div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          {quest.is_daily && <span className="rounded-full bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-accent">DAILY</span>}
          <span className="font-mono">+{quest.reward_xp} XP</span>
        </div>
      </div>

      {onRemove && !quest.is_daily && (
        <button
          onClick={() => onRemove(quest.id)}
          aria-label="Remove quest"
          className="opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};
