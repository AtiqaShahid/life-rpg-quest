import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ActivityType } from "@/hooks/usePlayer";
import { ACTIVITY_CATALOG, DurationOption, Subtype } from "@/lib/activityCatalog";
import * as Lucide from "lucide-react";
import { statMeta } from "@/lib/rpg";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  type: ActivityType | null;
  onSubmit: (typeId: string, subtype: string, duration: number, note?: string) => Promise<{ ok: boolean; reason?: string } | void>;
};

export const LogActivityDialog = ({ open, onOpenChange, type, onSubmit }: Props) => {
  const cat = type ? ACTIVITY_CATALOG[type.id] : null;
  const [subtype, setSubtype] = useState<Subtype | null>(null);
  const [duration, setDuration] = useState<DurationOption | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && cat) {
      setSubtype(cat.subtypes[0] ?? null);
      setDuration(null);
      setNote("");
    }
  }, [open, cat]);

  const Icon = useMemo(() => {
    if (!type) return Lucide.Zap;
    return (Lucide as unknown as Record<string, Lucide.LucideIcon>)[type.icon] ?? Lucide.Zap;
  }, [type]);

  if (!type || !cat) return null;
  const meta = statMeta[type.stat];

  const canSubmit = !!subtype && !!duration && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !subtype || !duration) return;
    setSubmitting(true);
    const res = await onSubmit(type.id, subtype.id, duration.minutes, note.trim() || undefined);
    setSubmitting(false);
    // Close on success or already-completed (parent shows toast)
    if (!res || res.ok || res.reason === "already_completed_today") {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong max-w-lg border-border/50 sm:rounded-3xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl ring-1"
              style={{
                background: `hsl(${meta.colorVar} / 0.15)`,
                color: `hsl(${meta.colorVar})`,
              }}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="font-display text-xl">Log {type.label}</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Pick the type & duration. XP scales with effort.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 pt-2">
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
            <label className="font-mono text-[11px] tracking-widest text-muted-foreground">DURATION</label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {cat.durations.map((d) => {
                const active = duration?.minutes === d.minutes;
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
                    <div className="mt-1 font-mono text-xs text-secondary">+{d.xp} XP</div>
                  </button>
                );
              })}
            </div>
          </div>

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

          {/* Submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-display text-sm font-semibold transition-all",
              canSubmit
                ? "bg-gradient-primary text-primary-foreground shadow-elegant hover:opacity-95"
                : "cursor-not-allowed bg-muted/40 text-muted-foreground"
            )}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {duration ? `Earn +${duration.xp} XP` : "Pick a duration"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};