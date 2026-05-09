import { useEffect, useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogPortal, DialogOverlay, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ActivityType, usePlayer } from "@/hooks/usePlayer";
import { ACTIVITY_CATALOG, DurationOption, Subtype } from "@/lib/activityCatalog";
import { Play } from "lucide-react";
import * as Lucide from "lucide-react";
import { statMeta } from "@/lib/rpg";
import { cn } from "@/lib/utils";
import { Loader2, X, ChevronLeft } from "lucide-react";
import { calculateXp, projectStreakDays, type Difficulty } from "@/lib/progression";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  type: ActivityType | null;
  onSubmit: (
    typeId: string,
    subtype: string,
    duration: number,
    difficulty: Difficulty,
    note?: string,
  ) => Promise<{ ok: boolean; reason?: string } | void>;
};

const ALLOWED_MINUTES = [10, 15, 20, 30] as const;
const DURATION_MULTIPLIER: Record<number, number> = { 10: 0.5, 15: 0.75, 20: 1, 30: 1.5 };

const DIFFICULTIES: { id: Difficulty; label: string; mult: number }[] = [
  { id: "easy",   label: "Easy",   mult: 1.0 },
  { id: "medium", label: "Medium", mult: 1.5 },
  { id: "hard",   label: "Hard",   mult: 2.0 },
];

export const LogActivityDialog = ({ open, onOpenChange, type, onSubmit }: Props) => {
  const p = usePlayer();
  const cat = type ? ACTIVITY_CATALOG[type.id] : null;
  const [subtype, setSubtype] = useState<Subtype | null>(null);
  const [duration, setDuration] = useState<DurationOption | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Fixed timed durations — no instant XP. Synthesize XP for missing slots.
  const sessionDurations: DurationOption[] = useMemo(() => {
    if (!cat) return [];
    const sorted = [...cat.durations].sort((a, b) => a.minutes - b.minutes);
    const baseline = sorted[0] ?? { minutes: 10, label: "10 min", xp: 10 };
    const perMin = baseline.xp / Math.max(1, baseline.minutes);
    return ALLOWED_MINUTES.map((m) => {
      const exact = cat.durations.find((d) => d.minutes === m);
      if (exact) return exact;
      return { minutes: m, label: `${m} min`, xp: Math.max(5, Math.round(perMin * m)) };
    });
  }, [cat]);

  useEffect(() => {
    if (open && cat) {
      setSubtype(cat.subtypes[0] ?? null);
      setDuration(null);
      setDifficulty("medium");
      setNote("");
    }
  }, [open, cat]);

  const Icon = useMemo(() => {
    if (!type) return Lucide.Zap;
    return (Lucide as unknown as Record<string, Lucide.LucideIcon>)[type.icon] ?? Lucide.Zap;
  }, [type]);

  // Live XP preview using the local engine (mirrors server math)
  const preview = useMemo(() => {
    if (!type || !duration || !p.profile || !p.streak) return null;
    return calculateXp({
      baseXp: duration.xp,
      typeId: type.id,
      difficulty,
      level: p.profile.level,
      streakDays: projectStreakDays(p.streak.current_streak, p.streak.last_active_date),
      nodes: p.skillNodes,
      catalog: p.skillCatalog,
    });
  }, [type, duration, difficulty, p.profile, p.streak, p.skillNodes, p.skillCatalog]);

  if (!type || !cat) return null;
  const meta = statMeta[type.stat];
  const canSubmit = !!subtype && !!duration && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !subtype || !duration) return;
    setSubmitting(true);
    const res = await onSubmit(type.id, subtype.id, duration.minutes, difficulty, note.trim() || undefined);
    setSubmitting(false);
    if (!res || res.ok || res.reason === "already_completed_today") {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="z-[80]" />
        <DialogPrimitive.Content
          className={cn(
            "glass-strong fixed left-1/2 top-2 z-[90] flex w-[calc(100vw-1rem)] max-w-lg -translate-x-1/2",
            "flex-col overflow-hidden border border-border/50 shadow-elegant outline-none",
            "max-h-[calc(100dvh-1rem)] sm:top-1/2 sm:max-h-[90vh] sm:-translate-y-1/2 sm:rounded-3xl",
            "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
          )}
        >
          {/* Sticky header with Back / Close */}
          <div className="relative flex shrink-0 items-center gap-3 border-b border-border/50 bg-background/80 p-4 backdrop-blur-xl sm:p-5">
            <DialogPrimitive.Close
              aria-label="Back"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <ChevronLeft className="h-5 w-5" />
            </DialogPrimitive.Close>
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1"
              style={{ background: `hsl(${meta.colorVar} / 0.15)`, color: `hsl(${meta.colorVar})` }}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate font-display text-base sm:text-lg">Start {type.label} session</DialogTitle>
              <DialogDescription className="truncate text-[11px] text-muted-foreground sm:text-xs">
                Commit to a duration. XP unlocks when the timer ends.
              </DialogDescription>
            </div>
            <DialogPrimitive.Close
              aria-label="Close"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          {/* Scrollable body */}
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 scrollbar-thin sm:px-6 sm:py-5">
          {/* Subtype */}
          <div>
            <label className="font-mono text-[11px] tracking-widest text-muted-foreground">TYPE</label>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {cat.subtypes.map((s) => {
                const active = subtype?.id === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSubtype(s)}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-left text-sm transition-all",
                      active
                        ? "border-primary/60 bg-primary/10 text-foreground shadow-elegant"
                        : "border-border bg-muted/30 text-muted-foreground hover:border-border hover:bg-muted/50"
                    )}
                  >
                    <div className="font-medium">{s.label}</div>
                    {s.description && <div className="mt-0.5 text-[11px] opacity-70">{s.description}</div>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="font-mono text-[11px] tracking-widest text-muted-foreground">SESSION DURATION</label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {sessionDurations.map((d) => {
                const active = duration?.minutes === d.minutes;
                const mult = DURATION_MULTIPLIER[d.minutes] ?? 1;
                return (
                  <button
                    key={d.minutes}
                    type="button"
                    onClick={() => setDuration(d)}
                    className={cn(
                      "flex flex-col items-center rounded-xl border px-3 py-3 transition-all",
                      active
                        ? "border-secondary/60 bg-secondary/10 shadow-elegant"
                        : "border-border bg-muted/30 hover:bg-muted/50"
                    )}
                  >
                    <div className="font-display text-sm font-semibold">{d.label}</div>
                    <div className="mt-1 font-mono text-[10px] text-secondary">×{mult.toFixed(2)} XP</div>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              You must complete the full timer to earn XP. Cancelling forfeits the reward.
            </p>
          </div>

          {/* Difficulty */}
          <div>
            <label className="font-mono text-[11px] tracking-widest text-muted-foreground">DIFFICULTY</label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {DIFFICULTIES.map((d) => {
                const active = difficulty === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDifficulty(d.id)}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-center transition-all",
                      active
                        ? "border-accent/60 bg-accent/10 text-foreground shadow-elegant"
                        : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    <div className="font-display text-sm font-semibold">{d.label}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-accent">×{d.mult.toFixed(1)}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Multiplier preview */}
          {preview && (
            <div className="glass rounded-xl p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[10px] tracking-widest text-muted-foreground">XP PREVIEW</span>
                <span className="font-display text-lg font-bold text-secondary">+{preview.final} XP</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px] text-muted-foreground sm:grid-cols-3">
                <div>base <span className="text-foreground">{preview.base}</span></div>
                <div>diff <span className="text-foreground">×{preview.difficulty.toFixed(2)}</span></div>
                <div>streak <span className="text-foreground">×{preview.streak.toFixed(2)}</span></div>
                <div>time <span className="text-foreground">×{preview.time_of_day.toFixed(2)}</span></div>
                <div>stat <span className="text-foreground">×{preview.stat.toFixed(2)}</span></div>
                <div>scale <span className="text-foreground">×{preview.diminish.toFixed(2)}</span></div>
              </div>
            </div>
          )}

          {/* Note */}
          <div>
            <label className="font-mono text-[11px] tracking-widest text-muted-foreground">NOTE (OPTIONAL)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. morning session, felt great"
              className="mt-1.5 w-full rounded-xl bg-muted/40 px-4 py-2.5 text-sm outline-none ring-1 ring-border transition-all focus:ring-primary"
            />
          </div>
          </div>

          {/* Fixed action bar — always visible */}
          <div
            className="shrink-0 border-t border-border/50 bg-background p-3 sm:p-4"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}
          >
            <div className="flex gap-2">
              <DialogPrimitive.Close
                className="flex items-center justify-center rounded-xl border border-border bg-muted/40 px-4 py-3 font-display text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                Cancel
              </DialogPrimitive.Close>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 font-display text-sm font-semibold transition-all",
                  canSubmit
                    ? "bg-gradient-primary text-primary-foreground shadow-glow-primary hover:opacity-95"
                    : "cursor-not-allowed bg-muted/40 text-muted-foreground",
                )}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {duration ? `Start ${duration.minutes}-min session` : "Pick a duration"}
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
};
