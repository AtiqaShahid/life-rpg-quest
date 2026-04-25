import { useState } from "react";
import { usePlayer, ActivityType } from "@/hooks/usePlayer";
import { ActivityPicker } from "@/components/rpg/ActivityPicker";
import { ActivityFeed } from "@/components/rpg/ActivityFeed";
import { LogActivityDialog } from "@/components/rpg/LogActivityDialog";
import { Loader2, Zap } from "lucide-react";

export default function Activities() {
  const p = usePlayer();
  const [openType, setOpenType] = useState<ActivityType | null>(null);

  if (p.loading) return <div className="flex h-[60vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…</div>;

  const pick = (id: string) => {
    const t = p.activityTypes.find(a => a.id === id);
    if (t) setOpenType(t);
  };

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-secondary"><Zap className="h-3.5 w-3.5" /> ACTIVITY LOG</div>
        <h1 className="mt-1 font-display text-3xl font-bold">Log an activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pick a category, choose duration, earn XP. One reward per activity per day.</p>
      </header>

      <section className="glass-strong rounded-3xl p-5 sm:p-6">
        <ActivityPicker types={p.activityTypes} onPick={pick} />
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">History</h2>
        <ActivityFeed activities={p.activities} types={p.activityTypes} />
      </section>

      <LogActivityDialog
        open={!!openType}
        onOpenChange={(v) => { if (!v) setOpenType(null); }}
        type={openType}
        onSubmit={(typeId, subtype, duration, note) => p.logActivity(typeId, subtype, duration, note)}
      />
    </div>
  );
}
