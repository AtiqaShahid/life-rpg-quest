import { useMemo, useState } from "react";
import { useActivitySession, formatRemaining } from "@/hooks/useActivitySession";
import { usePlayer } from "@/hooks/usePlayer";
import { ACTIVITY_CATALOG, subtypeLabel } from "@/lib/activityCatalog";
import { CheckCircle2, X, Loader2, Timer, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const ActiveSessionPanel = () => {
  const { session, remainingMs, elapsedMs, totalMs, isReady, clearSession } = useActivitySession();
  const p = usePlayer();
  const [completing, setCompleting] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const type = useMemo(
    () => (session ? p.activityTypes.find((t) => t.id === session.typeId) ?? null : null),
    [session, p.activityTypes],
  );

  if (!session) return null;

  const pct = totalMs > 0 ? Math.min(100, Math.round((elapsedMs / totalMs) * 100)) : 0;
  const subLabel = subtypeLabel(session.typeId, session.subtype);

  const onComplete = async () => {
    if (!isReady || completing) return;
    setCompleting(true);
    const res = await p.logActivity(
      session.typeId,
      session.subtype,
      session.duration,
      session.difficulty,
      session.note,
    );
    setCompleting(false);
    if (res?.ok || res?.reason === "already_completed_today") {
      clearSession();
    }
  };

  const onCancel = () => {
    if (!confirmCancel) {
      setConfirmCancel(true);
      toast.warning("Tap cancel again to forfeit this session — no XP will be granted.");
      window.setTimeout(() => setConfirmCancel(false), 4000);
      return;
    }
    clearSession();
    setConfirmCancel(false);
    toast.info("Session cancelled. No XP awarded.");
  };

  return (
    <section
      className={cn(
        "glass-strong relative overflow-hidden rounded-3xl border p-5 sm:p-6",
        isReady ? "border-secondary/60 shadow-glow-secondary" : "border-primary/40 shadow-glow-primary",
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-40"
        style={{
          background: isReady
            ? "radial-gradient(circle at 30% 0%, hsl(var(--secondary) / 0.25), transparent 70%)"
            : "radial-gradient(circle at 30% 0%, hsl(var(--primary) / 0.25), transparent 70%)",
        }}
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-primary">
            <Flame className="h-3.5 w-3.5" /> {isReady ? "SESSION READY" : "ACTIVE SESSION"}
          </div>
          <h2 className="mt-1 truncate font-display text-2xl font-bold">
            {type?.label ?? session.typeId}
            {subLabel ? <span className="ml-2 text-base font-normal text-muted-foreground">· {subLabel}</span> : null}
          </h2>
          <div className="mt-1 font-mono text-xs text-muted-foreground">
            {session.duration} min · {session.difficulty}
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-background/60 px-4 py-2">
          <Timer className="h-4 w-4 text-secondary" />
          <span className="font-mono text-2xl font-bold tabular-nums">
            {isReady ? "00:00" : formatRemaining(remainingMs)}
          </span>
        </div>
      </div>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: isReady
              ? "linear-gradient(90deg, hsl(var(--secondary)), hsl(var(--primary)))"
              : "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--secondary)))",
          }}
        />
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onComplete}
          disabled={!isReady || completing}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 font-display text-sm font-semibold transition-all",
            isReady
              ? "bg-gradient-primary text-primary-foreground shadow-glow-primary hover:opacity-95"
              : "cursor-not-allowed bg-muted/40 text-muted-foreground",
          )}
        >
          {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {isReady ? "Claim XP & Complete" : `Locked — ${formatRemaining(remainingMs)} remaining`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={cn(
            "flex items-center justify-center gap-2 rounded-xl border px-4 py-3 font-display text-sm font-medium transition-colors",
            confirmCancel
              ? "border-destructive/60 bg-destructive/15 text-destructive"
              : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          )}
        >
          <X className="h-4 w-4" />
          {confirmCancel ? "Confirm cancel" : "Cancel session"}
        </button>
      </div>
    </section>
  );
};