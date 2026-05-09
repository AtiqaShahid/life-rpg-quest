import { useState } from "react";
import { usePlayer, ActivityType } from "@/hooks/usePlayer";
import { ActivityPicker } from "@/components/rpg/ActivityPicker";
import { ActivityFeed } from "@/components/rpg/ActivityFeed";
import { LogActivityDialog } from "@/components/rpg/LogActivityDialog";
import { Loader2, Zap, Lock } from "lucide-react";
import { useActivitySession } from "@/hooks/useActivitySession";
import { ActiveSessionPanel } from "@/components/rpg/ActiveSessionPanel";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function Activities() {
  const p = usePlayer();
  const [openType, setOpenType] = useState<ActivityType | null>(null);
  const sess = useActivitySession();

  if (p.loading) return <div className="flex h-[60vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…</div>;

  const pick = (id: string) => {
    if (sess.session) {
      toast.info("A session is already running. Finish or cancel it first.");
      return;
    }
    const t = p.activityTypes.find(a => a.id === id);
    if (t) setOpenType(t);
  };

  const startSession = async (
    typeId: string,
    subtype: string,
    duration: number,
    difficulty: "easy" | "medium" | "hard",
    note?: string,
  ): Promise<{ ok: boolean; reason?: string }> => {
    const r = sess.startSession({ typeId, subtype, duration, difficulty, note });
    if (!r.ok) {
      toast.error(r.reason === "session_active" ? "Finish your current session first." : "Could not start session.");
      return r;
    }
    toast.success(`${duration}-min session started — focus up.`);
    return { ok: true };
  };

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-secondary"><Zap className="h-3.5 w-3.5" /> ACTIVITY LOG</div>
        <h1 className="mt-1 font-display text-3xl font-bold">Train your character</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pick an activity, commit to a timer, then earn XP. No instant rewards.</p>
      </header>

      {sess.session && (
        <ActiveSessionPanel />
      )}

      <section className="glass-strong rounded-3xl p-5 sm:p-6">
        {sess.session && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Activities are locked until your session ends.
          </div>
        )}
        <div className={cn(sess.session && "pointer-events-none opacity-40")}>
        <ActivityPicker types={p.activityTypes} onPick={pick} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">History</h2>
        <ActivityFeed activities={p.activities} types={p.activityTypes} />
      </section>

      <LogActivityDialog
        open={!!openType}
        onOpenChange={(v) => { if (!v) setOpenType(null); }}
        type={openType}
        onSubmit={startSession}
      />
    </div>
  );
}
