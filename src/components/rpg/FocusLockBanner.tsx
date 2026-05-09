import { useNavigate, useLocation } from "react-router-dom";
import { Lock, Timer } from "lucide-react";
import { useFocusLock, formatRemaining } from "@/hooks/useFocusLock";

/**
 * Global focus banner — visible across the entire app while a timed
 * activity or quest is in progress. Tells the user the XP ecosystem
 * is locked until the current commitment is complete.
 */
export const FocusLockBanner = () => {
  const lock = useFocusLock();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (!lock.isLocked) return null;

  const target = lock.source === "quest" ? "/app/quests" : "/app/activities";
  const onTarget = pathname.startsWith(target);

  return (
    <div className="fixed inset-x-0 top-0 z-[60] md:left-64">
      <button
        type="button"
        onClick={() => { if (!onTarget) navigate(target); }}
        className="flex w-full items-center gap-3 border-b border-primary/40 bg-background/85 px-4 py-2 text-left backdrop-blur-xl transition-colors hover:bg-background/95 sm:px-6"
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-primary text-primary-foreground shadow-glow-primary">
          {lock.isReady ? <Lock className="h-3.5 w-3.5" /> : <Timer className="h-3.5 w-3.5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] tracking-widest text-secondary">
            FOCUS SESSION ACTIVE · {lock.source === "quest" ? "QUEST" : "ACTIVITY"}
          </div>
          <div className="truncate font-display text-xs font-semibold sm:text-sm">
            {lock.title}
            <span className="ml-2 font-mono text-muted-foreground">
              {lock.isReady ? "ready — claim XP" : "progression locked"}
            </span>
          </div>
        </div>
        <span className="shrink-0 rounded-lg border border-primary/40 bg-background/60 px-2.5 py-1 font-mono text-xs font-bold tabular-nums text-primary">
          {lock.isReady ? "00:00" : formatRemaining(lock.remainingMs)}
        </span>
      </button>
    </div>
  );
};