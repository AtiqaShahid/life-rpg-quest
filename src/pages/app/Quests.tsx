import { useState } from "react";
import { usePlayer } from "@/hooks/usePlayer";
import { QuestCard } from "@/components/rpg/QuestCard";
import { Loader2, Plus, Scroll } from "lucide-react";

export default function Quests() {
  const p = usePlayer();
  const [title, setTitle] = useState("");
  const [xp, setXp] = useState(25);

  if (p.loading) return <div className="flex h-[60vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…</div>;

  const daily = p.quests.filter(q => q.is_daily);
  const custom = p.quests.filter(q => !q.is_daily);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await p.addQuest(title.trim(), xp);
    setTitle(""); setXp(25);
  };

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-secondary"><Scroll className="h-3.5 w-3.5" /> QUEST BOARD</div>
        <h1 className="mt-1 font-display text-3xl font-bold">Quests</h1>
        <p className="mt-1 text-sm text-muted-foreground">Daily quests refresh every morning. Custom quests stay until you finish them.</p>
      </header>

      <section className="glass-strong rounded-3xl p-5 sm:p-6">
        <h2 className="mb-3 font-display text-base font-semibold">Create a custom quest</h2>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr,auto,auto]">
          <input
            value={title} onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Finish project chapter 3"
            className="w-full rounded-xl bg-muted/40 px-4 py-2.5 text-sm outline-none ring-1 ring-border focus:ring-primary"
          />
          <input
            type="number" min={5} max={500} step={5}
            value={xp} onChange={e => setXp(Number(e.target.value) || 25)}
            className="w-24 rounded-xl bg-muted/40 px-4 py-2.5 text-sm outline-none ring-1 ring-border focus:ring-primary"
          />
          <button type="submit" className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-primary px-4 py-2.5 font-display text-sm font-semibold text-primary-foreground shadow-glow-primary transition-all hover:scale-[1.02]">
            <Plus className="h-4 w-4" /> Add
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Daily quests</h2>
        <div className="space-y-2">
          {daily.map(q => <QuestCard key={q.id} quest={q} onComplete={p.completeQuest} />)}
        </div>
      </section>

      {custom.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">Custom quests</h2>
          <div className="space-y-2">
            {custom.map(q => <QuestCard key={q.id} quest={q} onComplete={p.completeQuest} onRemove={p.removeQuest} />)}
          </div>
        </section>
      )}
    </div>
  );
}
