import { useState } from "react";
import { usePlayer } from "@/hooks/usePlayer";
import { ActivityPicker } from "@/components/rpg/ActivityPicker";
import { ActivityFeed } from "@/components/rpg/ActivityFeed";
import { Loader2, Zap } from "lucide-react";

export default function Activities() {
  const p = usePlayer();
  const [note, setNote] = useState("");

  if (p.loading) return <div className="flex h-[60vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…</div>;

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-secondary"><Zap className="h-3.5 w-3.5" /> ACTIVITY LOG</div>
        <h1 className="mt-1 font-display text-3xl font-bold">Log an activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pick what you did. Earn XP. Level up the corresponding stat.</p>
      </header>

      <section className="glass-strong rounded-3xl p-5 sm:p-6">
        <div className="mb-4">
          <label className="font-mono text-[11px] tracking-widest text-muted-foreground">OPTIONAL NOTE</label>
          <input
            value={note} onChange={e => setNote(e.target.value)}
            placeholder="e.g. 5km run in the park"
            className="mt-1.5 w-full rounded-xl bg-muted/40 px-4 py-2.5 text-sm outline-none ring-1 ring-border transition-all focus:ring-primary"
          />
        </div>
        <ActivityPicker types={p.activityTypes} onPick={(id) => { p.logActivity(id, note); setNote(""); }} />
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">History</h2>
        <ActivityFeed activities={p.activities} types={p.activityTypes} />
      </section>
    </div>
  );
}
